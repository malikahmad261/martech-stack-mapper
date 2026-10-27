import type { Anomaly, ChangeEvent, Entity, Fix, Health, Issue, Link, MetricPoint, Scan, Severity, Tool, ToolId } from '../model/schema';
import { detectAnomalies } from './anomalies';
import { Graph, inferLinks } from './graph';
import { MetricIndex } from './metrics';
import { RULES, type Finding, type Rule } from './rules';

export interface ScanInput {
  scanId: string;
  at: string;
  trigger: Scan['trigger'];
  baseEntities: Entity[]; // entity config after any applied fixes
  tools: Tool[];
  metrics: MetricPoint[];
  changeEvents: ChangeEvent[];
  prevIssues: Issue[];
  prevFixes: Fix[];
  prevAnomalies: Anomaly[];
  firstSeen?: (rule: Rule, finding: Finding) => string | undefined; // seed history only
  // false when re-evaluating right after a fix: resolutions are attributed to the next real scan.
  recordResolution?: boolean;
}

export interface ScanResult {
  scan: Scan;
  entities: Entity[];
  links: Link[];
  tools: Tool[];
  issues: Issue[];
  fixes: Fix[];
  anomalies: Anomaly[];
  ruleResults: { ruleId: string; passed: boolean; issueCount: number }[];
}

const SEVERITY_HEALTH: Record<Severity, Health> = { critical: 'broken', high: 'broken', medium: 'degraded', low: 'degraded' };
const HEALTH_RANK: Record<Health, number> = { broken: 4, degraded: 3, unknown: 2, healthy: 1, inactive: 0 };
export const worstHealth = (hs: Health[]): Health => hs.reduce<Health>((w, h) => (HEALTH_RANK[h] > HEALTH_RANK[w] ? h : w), 'healthy');

let metricCache: { points: MetricPoint[]; index: MetricIndex } | null = null;
function metricIndex(points: MetricPoint[]) {
  if (metricCache?.points !== points) metricCache = { points, index: new MetricIndex(points) };
  return metricCache.index;
}

export function runScan(input: ScanInput): ScanResult {
  const { entities: inferredEntities, links } = inferLinks(input.baseEntities);
  const graph = new Graph(inferredEntities, links);
  const metrics = metricIndex(input.metrics);
  const tools = new Map(input.tools.map((t) => [t.id, t] as [ToolId, Tool]));
  const asOf = metrics.dates[metrics.dates.length - 1];
  const ctx = { graph, tools, metrics, changeEvents: input.changeEvents, asOf };

  const prevIssues = new Map(input.prevIssues.map((i) => [i.id, i]));
  const fixes = new Map(input.prevFixes.map((f) => [f.id, structuredClone(f)]));
  const issues: Issue[] = [];
  const seen = new Set<string>();
  const ruleResults: ScanResult['ruleResults'] = [];
  const pendingFixedBy: { issue: Issue; target: string }[] = [];
  const resolvedIn = input.recordResolution === false ? undefined : input.scanId;

  for (const rule of RULES) {
    const findings = rule.check(ctx);
    ruleResults.push({ ruleId: rule.id, passed: findings.length === 0, issueCount: findings.length });
    for (const f of findings) {
      const id = `${rule.id}:${f.entityIds[0]}`;
      seen.add(id);
      const prev = prevIssues.get(id);
      const prevFix = prev?.fixId ? fixes.get(prev.fixId) : undefined;
      const issue: Issue = {
        id,
        ruleId: rule.id,
        category: rule.category,
        severity: rule.severity,
        title: f.title,
        entityIds: f.entityIds,
        linkIds: f.linkIds,
        evidence: f.evidence,
        diagnosis: f.diagnosis,
        status: 'open',
        firstDetectedScanId: prev?.firstDetectedScanId ?? input.firstSeen?.(rule, f) ?? input.scanId,
        fixId: prev?.fixId,
      };

      if (prev?.status === 'dismissed') issue.status = 'dismissed';
      else if (prevFix?.status === 'applied') {
        if (rule.dataBased) {
          // Can't be confirmed from config; wait for data after the fix.
          issue.status = 'resolved';
          issue.verification = 'pending_data';
          issue.resolvedScanId = prev?.resolvedScanId ?? resolvedIn;
        } else {
          // Fix was applied but the check still fails (e.g. the recommendation was edited) — reopen with a fresh fix.
          issue.fixId = undefined;
        }
      } else if (prevFix && (prevFix.status === 'approved' || prevFix.status === 'edited')) issue.status = prevFix.status === 'approved' ? 'fix_pending' : 'open';

      if (!issue.fixId && issue.status === 'open' && f.fix) {
        const n = [...fixes.keys()].filter((k) => k.startsWith(`${id}:fix`)).length;
        const fixId = `${id}:fix${n ? `-${n + 1}` : ''}`;
        const ops = f.fix.ops.map((o, i) => ({ id: `${fixId}:op${i}`, entityId: o.entityId, field: o.field, op: o.op ?? 'set', from: getFrom(graph, o.entityId, o.field), to: o.to }));
        fixes.set(fixId, {
          id: fixId,
          issueIds: [id],
          title: f.fix.title,
          rationale: f.fix.rationale,
          risk: f.fix.risk,
          manualSteps: f.fix.manualSteps,
          verifyAfter: f.fix.verifyAfter,
          recommended: ops,
          current: structuredClone(ops),
          notes: '',
          status: 'draft',
          history: [{ at: input.at, action: 'Recommended by scan', by: 'Stack Mapper' }],
        });
        issue.fixId = fixId;
      }
      if (f.fixedBy) pendingFixedBy.push({ issue, target: `${f.fixedBy.ruleId}:${f.fixedBy.entityId}` });
      issues.push(issue);
    }
  }

  // Issues resolved by another issue's fix share that fix.
  for (const { issue, target } of pendingFixedBy) {
    const host = issues.find((i) => i.id === target) ?? prevIssues.get(target);
    const fix = host?.fixId ? fixes.get(host.fixId) : undefined;
    if (!fix) continue;
    if (!fix.issueIds.includes(issue.id)) fix.issueIds.push(issue.id);
    issue.fixId = fix.id;
    if (fix.status === 'applied' && issue.status !== 'dismissed') {
      issue.status = 'resolved';
      issue.verification = 'pending_data';
      issue.resolvedScanId ??= resolvedIn;
    }
  }

  // Previously open issues the rules no longer find are resolved.
  for (const prev of input.prevIssues) {
    if (seen.has(prev.id)) continue;
    issues.push({
      ...prev,
      status: prev.status === 'dismissed' ? 'dismissed' : 'resolved',
      verification: 'confirmed',
      resolvedScanId: prev.status === 'resolved' && prev.resolvedScanId ? prev.resolvedScanId : resolvedIn,
    });
  }
  const resolvedCount = resolvedIn ? issues.filter((i) => i.status === 'resolved' && i.resolvedScanId === resolvedIn).length : 0;

  // Health: entities and links touched by active issues; paused/deleted entities are inactive.
  const active = issues.filter((i) => i.status === 'open' || i.status === 'fix_pending');
  const entityHealth = new Map<string, Health[]>();
  const linkHealth = new Map<string, Health[]>();
  for (const i of active) {
    const h = SEVERITY_HEALTH[i.severity];
    for (const id of i.entityIds) (entityHealth.get(id) ?? entityHealth.set(id, []).get(id)!).push(h);
    for (const id of i.linkIds) (linkHealth.get(id) ?? linkHealth.set(id, []).get(id)!).push(h);
  }
  const entities = inferredEntities.map((e) => ({
    ...e,
    health: e.status !== 'active' ? ('inactive' as const) : worstHealth(entityHealth.get(e.id) ?? ['healthy']),
  }));
  const byId = new Map(entities.map((e) => [e.id, e]));
  const healthLinks = links.map((l) => ({
    ...l,
    health:
      byId.get(l.from)?.health === 'inactive' || byId.get(l.to)?.health === 'inactive'
        ? ('inactive' as const)
        : worstHealth(linkHealth.get(l.id) ?? ['healthy']),
  }));

  // Anomalies: detection is deterministic for a given dataset; keep user-set statuses.
  const prevAnoms = new Map(input.prevAnomalies.map((a) => [a.id, a]));
  const anomalies = detectAnomalies(new Graph(entities, healthLinks), metrics, input.changeEvents, issues).map((a) => {
    const prev = prevAnoms.get(a.id);
    return prev ? { ...a, status: prev.status } : a;
  });

  // Tool settings that fixes can change are refreshed from entities.
  const container = (tool: ToolId) => entities.find((e) => e.kind === 'gtm_container' && e.tool === tool);
  const toolsOut = input.tools.map((t) => {
    const c = container(t.id);
    if (!c) return t;
    return { ...t, settings: { ...t.settings, liveVersion: c.config.liveVersion, liveVersionName: c.config.liveVersionName } };
  });

  const newIssues = issues.filter((i) => i.firstDetectedScanId === input.scanId && !prevIssues.has(i.id)).length;
  const scan: Scan = {
    id: input.scanId,
    trigger: input.trigger,
    startedAt: input.at,
    finishedAt: new Date(new Date(input.at).getTime() + 42_000).toISOString(),
    sources: (['gtm_web', 'gtm_server', 'ga4', 'google_ads', 'meta'] as const).map((source) => ({ source, status: 'ok', snapshotId: `${input.scanId}:${source}` })),
    summary: { newIssues, resolvedIssues: resolvedCount, configChanges: 0 },
  };

  return { scan, entities, links: healthLinks, tools: toolsOut, issues, fixes: [...fixes.values()], anomalies, ruleResults };
}

function getFrom(graph: Graph, entityId: string, field: string): unknown {
  const e = graph.byId.get(entityId);
  return e ? field.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), e.config) : undefined;
}
