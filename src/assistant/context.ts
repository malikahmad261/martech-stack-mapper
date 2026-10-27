import type { Graph } from '../engine/graph';
import type { MetricIndex } from '../engine/metrics';
import type { ChangeEvent, Entity, Tool } from '../model/schema';
import { CELL_STATE, PLATFORMS, reportedSeries, type ConversionRow, type Platform } from '../insights/conversions';
import type { Problem } from '../insights/problems';

// Things a person can select in the UI and hand to the assistant. Each item resolves to the exact
// payload that would be sent to the model, so the composer can show it before sending.

export type ContextItem =
  | { kind: 'problem'; id: string }
  | { kind: 'entity'; id: string }
  | { kind: 'metric'; entityId: string; start: string; end: string }
  | { kind: 'conversion'; id: string; platform?: Platform }
  | { kind: 'change'; id: string };

export interface AssistantData {
  graph: Graph;
  problems: Problem[];
  metrics: MetricIndex;
  changeEvents: ChangeEvent[];
  grid: ConversionRow[];
  tools: Tool[];
  role: 'client' | 'consultant';
}

export interface ResolvedContext {
  key: string;
  item: ContextItem;
  label: string;
  sublabel: string;
  payload: unknown;
}

export function contextKey(c: ContextItem): string {
  switch (c.kind) {
    case 'metric':
      return `metric:${c.entityId}:${c.start}:${c.end}`;
    case 'conversion':
      return `conversion:${c.id}:${c.platform ?? 'all'}`;
    default:
      return `${c.kind}:${c.id}`;
  }
}

const TOOL_NAMES: Record<string, string> = { site: 'Website', gtm_web: 'GTM Web', gtm_server: 'GTM Server', ga4: 'GA4', google_ads: 'Google Ads', meta: 'Meta' };
export const toolName = (t: string) => TOOL_NAMES[t] ?? t;
const PLATFORM_NAMES: Record<Platform, string> = { ga4: 'GA4', google_ads: 'Google Ads', meta: 'Meta' };

const KIND_NAMES: Partial<Record<Entity['kind'], string>> = {
  datalayer_event: 'dataLayer event',
  gtm_tag: 'tag',
  gtm_trigger: 'trigger',
  gtm_variable: 'variable',
  gtm_client: 'server client',
  ga4_event: 'event',
  ga4_stream: 'data stream',
  gads_conversion_action: 'conversion action',
  gads_campaign: 'campaign',
  meta_event: 'event',
  meta_campaign: 'campaign',
  meta_custom_conversion: 'custom conversion',
  meta_dataset: 'dataset',
};
export const kindName = (e: Entity) => KIND_NAMES[e.kind] ?? e.kind.replace(/^[a-z0-9]+_/, '').replace(/_/g, ' ');

/** "GTM Web · Meta – Lead" style path strings, upstream-most first. */
export function pathStrings(g: Graph, id: string, dir: 'up' | 'down', limit = 4): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of g.lineage(id, dir)) {
    const s = p.steps.map((st) => {
      const e = g.byId.get(st.entityId);
      return e ? `${toolName(e.tool)} · ${e.name}` : st.entityId;
    }).join(' → ');
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
    if (out.length >= limit) break;
  }
  return out;
}

/** Daily rows for an entity's metrics between two dates (inclusive). */
export function metricRows(e: Entity, m: MetricIndex, start: string, end: string): Record<string, string | number>[] {
  const series = metricSeries(e, m);
  return m.dates
    .map((date, i) => ({ date, i }))
    .filter(({ date }) => date >= start && date <= end)
    .map(({ date, i }) => ({ date, ...Object.fromEntries(series.map((s) => [s.name, round(s.values[i])])) }));
}

export function metricSeries(e: Entity, m: MetricIndex): { name: string; values: number[] }[] {
  if (e.kind === 'gads_campaign' || e.kind === 'meta_campaign')
    return (['spend', 'clicks', 'conversions'] as const).map((name) => ({ name, values: m.get(e.id, name) }));
  if (e.kind === 'meta_event')
    return [
      { name: 'reported', values: reportedSeries(e, m) },
      { name: 'browser_pixel', values: m.get(e.id, 'events_browser') },
      { name: 'server_capi', values: m.get(e.id, 'events_server') },
    ].filter((s) => s.values.some((v) => v > 0));
  const own = reportedSeries(e, m);
  return own.some((v) => v > 0) ? [{ name: e.kind === 'gads_conversion_action' ? 'conversions' : 'events', values: own }] : [];
}

const round = (x: number) => Math.round(x * 10) / 10;

export function resolveContext(item: ContextItem, d: AssistantData): ResolvedContext | null {
  const key = contextKey(item);
  const g = d.graph;
  switch (item.kind) {
    case 'problem': {
      const p = d.problems.find((x) => x.id === item.id);
      if (!p) return null;
      return {
        key,
        item,
        label: p.headline,
        sublabel: 'Problem',
        payload: {
          type: 'problem',
          headline: p.headline,
          severity: p.severity,
          status: p.status,
          impact: p.impact,
          rule: p.ruleId,
          technical_title: p.technicalTitle,
          diagnosis: p.issue?.diagnosis,
          evidence: p.issue?.evidence,
          affected: p.entityIds.map((id) => entityRef(g.byId.get(id), id)),
          anomalies: p.anomalies.map((a) => ({ entity: g.byId.get(a.entityId)?.name, metric: a.metric, window: a.window, baseline_per_day: round(a.baseline), observed_per_day: round(a.observed), change_pct: Math.round(a.changePct * 100), likely_cause: a.likelyCause.explanation })),
          fix: p.fix && {
            title: p.fix.title,
            risk: p.fix.risk,
            status: p.fix.status,
            changes: p.fix.current.map((o) => ({ target: entityRef(g.byId.get(o.entityId), o.entityId), field: o.field, from: o.from, to: o.to })),
            manual_steps: p.fix.manualSteps,
          },
        },
      };
    }
    case 'entity': {
      const e = g.byId.get(item.id);
      if (!e) return null;
      const problems = d.problems.filter((p) => p.entityIds.includes(e.id) && p.status !== 'fixed');
      return {
        key,
        item,
        label: e.name,
        sublabel: `${toolName(e.tool)} ${kindName(e)}`,
        payload: {
          type: 'entity',
          tool: toolName(e.tool),
          kind: e.kind,
          name: e.name,
          id: e.externalId,
          status: e.status,
          health: e.health,
          config: e.config,
          upstream: pathStrings(g, e.id, 'up'),
          downstream: pathStrings(g, e.id, 'down'),
          open_problems: problems.map((p) => p.headline),
        },
      };
    }
    case 'metric': {
      const e = g.byId.get(item.entityId);
      if (!e) return null;
      const rows = metricRows(e, d.metrics, item.start, item.end);
      return {
        key,
        item,
        label: `${e.name}, ${fmtShort(item.start)}–${fmtShort(item.end)}`,
        sublabel: `${rows.length} days of data`,
        payload: { type: 'daily_metrics', entity: entityRef(e, e.id), from: item.start, to: item.end, rows },
      };
    }
    case 'conversion': {
      const row = d.grid.find((r) => r.conversion.id === item.id);
      if (!row) return null;
      const platforms = item.platform ? [item.platform] : [...PLATFORMS];
      return {
        key,
        item,
        label: item.platform ? `${row.conversion.label} → ${PLATFORM_NAMES[item.platform]}` : row.conversion.label,
        sublabel: 'Conversion',
        payload: {
          type: 'conversion',
          conversion: row.conversion.label,
          description: row.conversion.description,
          source_event: row.sourceEvent?.name,
          platforms: platforms.map((p) => {
            const c = row.cells[p];
            return {
              platform: PLATFORM_NAMES[p],
              status: CELL_STATE[c.state].label,
              tracked_as: c.entities.map((e) => e.name),
              last_7_days: round(c.last7),
              typical_week: round(c.baseline7),
              problems: c.problems.map((x) => x.headline),
            };
          }),
        },
      };
    }
    case 'change': {
      const c = d.changeEvents.find((x) => x.id === item.id);
      if (!c) return null;
      return {
        key,
        item,
        label: c.summary.length > 60 ? `${c.summary.slice(0, 57)}…` : c.summary,
        sublabel: `${toolName(c.tool)} change`,
        payload: { type: 'change', tool: toolName(c.tool), at: c.at, by: c.actor, summary: c.summary, entities: c.entityIds.map((id) => g.byId.get(id)?.name ?? id), before: c.before, after: c.after },
      };
    }
  }
}

function entityRef(e: Entity | undefined, id: string) {
  return e ? `${toolName(e.tool)} ${kindName(e)} "${e.name}"` : id;
}

export const fmtShort = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Rough token estimate (≈4 characters per token) for showing context size. */
export const estimateTokens = (payload: unknown) => Math.ceil(JSON.stringify(payload).length / 4);
