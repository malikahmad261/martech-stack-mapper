import { LINK_FLOW } from '../engine/graph';
import { worstHealth } from '../engine/scan';
import type { Anomaly, Entity, Health, Issue, Link, LinkType, ToolId } from '../model/schema';
import { SEVERITY } from './meta';

export const isActiveIssue = (i: Issue) => i.status === 'open' || i.status === 'fix_pending';
export const isActiveAnomaly = (a: Anomaly) => a.status === 'new' || a.status === 'acknowledged';

/** 0–100: starts at 100 and loses weighted points per active issue. */
export function healthScore(issues: Issue[]) {
  const penalty = issues.filter(isActiveIssue).reduce((s, i) => s + SEVERITY[i.severity].weight, 0);
  return Math.max(0, 100 - penalty);
}

export function scoreColor(score: number) {
  return score >= 80 ? 'text-emerald-600' : score >= 50 ? 'text-amber-600' : 'text-rose-600';
}

export function toolHealth(tool: ToolId, entities: Entity[]): Health {
  return worstHealth(entities.filter((e) => e.tool === tool && e.health !== 'inactive').map((e) => e.health));
}

export interface ToolEdge {
  from: ToolId;
  to: ToolId;
  links: Link[];
  health: Health;
  byType: Partial<Record<LinkType, number>>;
}

/** Aggregate entity links into tool-to-tool edges in data-flow direction. */
export function toolEdges(entities: Entity[], links: Link[]): ToolEdge[] {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const edges = new Map<string, ToolEdge>();
  for (const l of links) {
    if (l.type === 'deduplicates_with' || l.type === 'uses_variable') continue;
    const a = byId.get(l.from)?.tool;
    const b = byId.get(l.to)?.tool;
    if (!a || !b || a === b) continue;
    const [from, to] = LINK_FLOW[l.type] === 'reverse' ? [b, a] : [a, b];
    const key = `${from}>${to}`;
    const e = edges.get(key) ?? { from, to, links: [], health: 'healthy' as Health, byType: {} };
    e.links.push(l);
    e.byType[l.type] = (e.byType[l.type] ?? 0) + 1;
    edges.set(key, e);
  }
  for (const e of edges.values()) e.health = worstHealth(e.links.map((l) => l.health));
  return [...edges.values()];
}
