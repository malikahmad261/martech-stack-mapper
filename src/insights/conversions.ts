import { CONVERSION_PLAN, type PlannedConversion } from '../connectors/demo/conversionPlan';
import type { Graph } from '../engine/graph';
import type { MetricIndex } from '../engine/metrics';
import type { Entity, Health } from '../model/schema';
import { isActiveProblem, SEVERITY_ORDER, type Problem } from './problems';

// The overview's question: "is each conversion reaching each platform?" One cell per
// conversion × platform, backed by the planned entities, their daily counts and the problems
// that touch them or anything upstream of them.

export const PLATFORMS = ['ga4', 'google_ads', 'meta'] as const;
export type Platform = (typeof PLATFORMS)[number];

export type CellState = 'ok' | 'attention' | 'broken' | 'verifying' | 'not_set_up' | 'paused';

export const CELL_STATE: Record<CellState, { label: string; tone: string; dot: string }> = {
  ok: { label: 'Tracking', tone: 'text-emerald-700', dot: 'bg-emerald-500' },
  attention: { label: 'Needs attention', tone: 'text-amber-700', dot: 'bg-amber-500' },
  broken: { label: 'Broken', tone: 'text-rose-700', dot: 'bg-rose-500' },
  verifying: { label: 'Fixed — confirming', tone: 'text-sky-700', dot: 'bg-sky-500' },
  not_set_up: { label: 'Not tracked', tone: 'text-slate-400', dot: 'bg-slate-300' },
  paused: { label: 'Paused', tone: 'text-slate-500', dot: 'bg-slate-300' },
};

export interface ConversionCell {
  conversionId: string;
  platform: Platform;
  entities: Entity[];
  state: CellState;
  /** Daily reported count over the whole data window. */
  daily: number[];
  last7: number;
  /** Weekly average over the 4 weeks before the last 7 days. */
  baseline7: number;
  changePct: number | null;
  problems: Problem[];
}

export interface ConversionRow {
  conversion: PlannedConversion;
  sourceEvent?: Entity;
  cells: Record<Platform, ConversionCell>;
}

function plannedEntities(c: PlannedConversion, p: Platform, entities: Entity[]): Entity[] {
  const find = (kind: Entity['kind'], name?: string) => (name ? entities.filter((e) => e.kind === kind && e.name === name) : []);
  if (p === 'ga4') return find('ga4_event', c.ga4Event);
  if (p === 'google_ads') return c.googleAdsActions.flatMap((n) => find('gads_conversion_action', n));
  return [...find('meta_event', c.metaEvent), ...find('meta_custom_conversion', c.metaCustomConversion)];
}

/** What the platform itself would report for an entity, per day. */
export function reportedSeries(e: Entity, m: MetricIndex): number[] {
  if (e.kind === 'ga4_event') return m.get(e.id, 'events');
  if (e.kind === 'gads_conversion_action') return m.get(e.id, 'conversions');
  if (e.kind === 'meta_event') {
    // Meta removes duplicates when Pixel and CAPI share an event_id; dedupBrowserPct is how often that works.
    const b = m.get(e.id, 'events_browser');
    const s = m.get(e.id, 'events_server');
    const dedup = Number((e.config as Record<string, unknown>).dedupBrowserPct ?? 0) / 100;
    return b.map((v, i) => Math.round(v + s[i] - Math.min(v, s[i]) * dedup));
  }
  return [];
}

const HEALTH_STATE: Record<Health, CellState> = { healthy: 'ok', unknown: 'ok', degraded: 'attention', broken: 'broken', inactive: 'paused' };

export function buildConversionGrid(graph: Graph, metrics: MetricIndex, problems: Problem[]): ConversionRow[] {
  const active = problems.filter((p) => isActiveProblem(p) && !p.fyi);
  // Fixed problems that still need new data to confirm; the old numbers will look broken until then.
  const verifying = problems.filter((p) => p.status === 'verifying' || (p.status === 'fixed' && p.fix?.status === 'applied'));
  return CONVERSION_PLAN.map((conversion) => {
    const cells = {} as Record<Platform, ConversionCell>;
    for (const platform of PLATFORMS) {
      const entities = plannedEntities(conversion, platform, graph.entities);
      // Problems on the entity or anything feeding it (tags, triggers, server tags…).
      const scope = new Set(entities.flatMap((e) => [e.id, ...graph.reachable(e.id, 'up')]));
      const cellProblems = active
        .filter((p) => p.entityIds.some((id) => scope.has(id)))
        .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
      // Duplicate Ads actions are summed: that's what the account reports in "Conversions".
      const daily = metrics.sum(entities.map((e) => reportedSeries(e, metrics)));
      const last7 = metrics.last(daily, 7);
      const baseline7 = metrics.avg(daily, 28, 7) * 7;
      // Only problems that change the numbers make a cell "broken"; consent or cookie problems upstream
      // are worth attention but don't stop the conversion being counted.
      const ids = new Set(entities.map((e) => e.id));
      const breaking = cellProblems.some((p) => (p.severity === 'critical' || p.severity === 'high') && affectsCounts(p) && landsOn(p, platform, ids, graph));
      let state: CellState = entities.length === 0 ? 'not_set_up' : entities.every((e) => e.status !== 'active') ? 'paused' : HEALTH_STATE[worstEntityHealth(entities)];
      if (entities.length && breaking) state = 'broken';
      else if (entities.length && cellProblems.length) state = 'attention';
      else if (state === 'broken') state = 'attention';
      if (entities.length && !breaking && verifying.some((p) => affectsCounts(p) && landsOn(p, platform, ids, graph))) state = 'verifying';
      cells[platform] = {
        conversionId: conversion.id,
        platform,
        entities,
        state,
        daily,
        last7,
        baseline7,
        changePct: baseline7 > 0 ? last7 / baseline7 - 1 : null,
        problems: cellProblems,
      };
    }
    const sourceEvent = conversion.datalayerEvent ? graph.entities.find((e) => e.kind === 'datalayer_event' && e.name === conversion.datalayerEvent) : undefined;
    return { conversion, sourceEvent, cells };
  });
}

// How far downstream each platform sits; a problem "lands" on the furthest platform it involves.
const PLATFORM_RANK: Record<string, number> = { ga4: 1, google_ads: 2, meta: 2 };

/** Does the problem change the numbers this cell reports (not just something next to it)? */
function landsOn(p: Problem, platform: Platform, cellIds: Set<string>, graph: Graph) {
  if (p.anomalies.some((a) => cellIds.has(a.entityId))) return true;
  if (!p.issue) return false;
  if (cellIds.has(p.issue.entityIds[0])) return true;
  if (!p.issue.entityIds.some((id) => cellIds.has(id))) return false;
  const furthest = Math.max(...p.issue.entityIds.map((id) => PLATFORM_RANK[graph.byId.get(id)?.tool ?? ''] ?? 0));
  return PLATFORM_RANK[platform] === furthest;
}

function affectsCounts(p: Problem) {
  if (p.source === 'anomaly') return p.anomalies[0]?.type === 'tracking_outage';
  return p.issue?.category === 'conversion_tracking' || p.issue?.category === 'data_quality';
}

const RANK: Health[] = ['healthy', 'unknown', 'inactive', 'degraded', 'broken'];
function worstEntityHealth(es: Entity[]): Health {
  return es.map((e) => e.health).reduce((w, h) => (RANK.indexOf(h) > RANK.indexOf(w) ? h : w), 'healthy' as Health);
}
