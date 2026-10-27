import type { Anomaly, ChangeEvent, Entity, Fix, FixOperation, Issue, Link, MetricPoint, Scan, Tool, ToolId } from '../model/schema';
import { scanIdFor } from './demo';
import { applyOperations, formatValue, getPath, validateOperations } from './fixes';
import { runScan } from './scan';

// Pure state transitions for the fix workflow and re-scans. The store wraps these.

export interface AppData {
  baseEntities: Entity[]; // normalised config + applied fixes (input to every scan)
  tools: Tool[];
  entities: Entity[]; // with derived entities and health
  links: Link[];
  issues: Issue[];
  fixes: Fix[];
  anomalies: Anomaly[];
  scans: Scan[]; // newest first
  changeEvents: ChangeEvent[];
  ruleResults: { ruleId: string; passed: boolean; issueCount: number }[];
}

export const ACTOR = 'You (via Stack Mapper)';

function rescanInternal(data: AppData, metrics: MetricPoint[], opts: { scanId: string; at: string; trigger: Scan['trigger']; record: boolean }) {
  return runScan({
    scanId: opts.scanId,
    at: opts.at,
    trigger: opts.trigger,
    baseEntities: data.baseEntities,
    tools: data.tools,
    metrics,
    changeEvents: data.changeEvents,
    prevIssues: data.issues,
    prevFixes: data.fixes,
    prevAnomalies: data.anomalies,
    recordResolution: opts.record,
  });
}

export function rescan(data: AppData, metrics: MetricPoint[], at: string, trigger: Scan['trigger'] = 'on_demand'): AppData {
  const scanId = scanIdFor(at, trigger);
  const r = rescanInternal(data, metrics, { scanId, at, trigger, record: true });
  const prevAt = data.scans[0]?.startedAt ?? '';
  const scan: Scan = { ...r.scan, summary: { ...r.scan.summary, configChanges: data.changeEvents.filter((c) => c.at > prevAt && c.at <= at).length } };
  return { ...data, tools: r.tools, entities: r.entities, links: r.links, issues: r.issues, fixes: r.fixes, anomalies: r.anomalies, ruleResults: r.ruleResults, scans: [scan, ...data.scans] };
}

export function updateFix(data: AppData, fixId: string, patch: { current?: FixOperation[]; notes?: string }, at: string): AppData {
  const fix = data.fixes.find((f) => f.id === fixId);
  if (!fix || fix.status === 'applied') return data;
  const current = patch.current ?? fix.current;
  const notes = patch.notes ?? fix.notes;
  const edited = JSON.stringify(current) !== JSON.stringify(fix.recommended) || notes !== '';
  // Any edit (including to an approved fix) needs a fresh approval.
  const status = fix.status === 'rejected' ? 'rejected' : edited ? 'edited' : 'draft';
  const last = fix.history[fix.history.length - 1];
  const history = last?.action === 'Edited' ? fix.history : [...fix.history, { at, action: 'Edited', by: ACTOR }];
  return {
    ...data,
    fixes: data.fixes.map((f) => (f.id === fixId ? { ...f, current, notes, status, history } : f)),
    issues: data.issues.map((i) => (fix.issueIds.includes(i.id) && i.status === 'fix_pending' ? { ...i, status: 'open' } : i)),
  };
}

export function revertFix(data: AppData, fixId: string, at: string): AppData {
  return {
    ...data,
    fixes: data.fixes.map((f) =>
      f.id === fixId && f.status !== 'applied'
        ? { ...f, current: structuredClone(f.recommended), status: 'draft', history: [...f.history, { at, action: 'Reverted to recommendation', by: ACTOR }] }
        : f,
    ),
  };
}

export function setFixStatus(data: AppData, fixId: string, status: 'approved' | 'rejected' | 'draft', at: string): AppData {
  const fix = data.fixes.find((f) => f.id === fixId);
  if (!fix || fix.status === 'applied') return data;
  if (status === 'approved') {
    const v = validateOperations(data.baseEntities, fix.current);
    if (Object.keys(v.errors).length) throw new Error('Fix has validation errors');
  }
  const label = { approved: 'Approved', rejected: 'Rejected', draft: 'Moved back to draft' }[status];
  const edited = JSON.stringify(fix.current) !== JSON.stringify(fix.recommended) || fix.notes !== '';
  const nextStatus = status === 'draft' ? (edited ? 'edited' : 'draft') : status;
  return {
    ...data,
    fixes: data.fixes.map((f) => (f.id === fixId ? { ...f, status: nextStatus, history: [...f.history, { at, action: label, by: ACTOR }] } : f)),
    issues: data.issues.map((i) =>
      fix.issueIds.includes(i.id) && (i.status === 'open' || i.status === 'fix_pending') ? { ...i, status: status === 'approved' ? 'fix_pending' : 'open' } : i,
    ),
  };
}

/** Simulated publish: apply the (possibly edited) operations, bump GTM versions, log changes, re-evaluate. */
export function applyFix(data: AppData, metrics: MetricPoint[], fixId: string, at: string): AppData {
  const fix = data.fixes.find((f) => f.id === fixId);
  if (!fix || fix.status !== 'approved') throw new Error('Only approved fixes can be applied');
  const v = validateOperations(data.baseEntities, fix.current);
  if (Object.keys(v.errors).length) throw new Error('Fix has validation errors');

  const byId = new Map(data.baseEntities.map((e) => [e.id, e]));
  let base = applyOperations(data.baseEntities, fix.current);
  const touchedTools = [...new Set(fix.current.map((o) => byId.get(o.entityId)?.tool).filter(Boolean))] as ToolId[];
  const newEvents: ChangeEvent[] = [];
  const toolNames: Record<string, string> = Object.fromEntries(data.tools.map((t) => [t.id, t.name]));

  for (const tool of touchedTools) {
    const ops = fix.current.filter((o) => byId.get(o.entityId)?.tool === tool);
    const before = ops.map((o) => ({ entity: byId.get(o.entityId)!.name, field: o.field, value: formatValue(getPath(byId.get(o.entityId)!.config, o.field), byId) }));
    const after = ops.map((o) => ({ entity: byId.get(o.entityId)!.name, field: o.field, value: formatValue(o.to, byId) }));
    let summary = `Applied fix "${fix.title}" in ${toolNames[tool]}`;
    let kind: ChangeEvent['kind'] = 'fix_applied';
    const entityIds = [...new Set(ops.map((o) => o.entityId))];
    if (tool === 'gtm_web' || tool === 'gtm_server') {
      const container = base.find((e) => e.kind === 'gtm_container' && e.tool === tool)!;
      const version = Number(container.config.liveVersion) + 1;
      const name = `v${version} – ${fix.title}`;
      base = base.map((e) => (e.id === container.id ? { ...e, config: { ...e.config, liveVersion: version, liveVersionName: name } } : e));
      summary = `Published ${name}${fix.notes ? ` — ${fix.notes}` : ''}`;
      kind = 'gtm_publish';
      entityIds.unshift(container.id);
    }
    newEvents.push({ id: `${tool}:fix:${fix.id}:${at}`, tool, at, actor: ACTOR, kind, summary, entityIds, before, after });
  }

  const tools = data.tools.map((t) => (touchedTools.includes(t.id) ? { ...t, lastChangedAt: at } : t));
  const fixes = data.fixes.map((f) =>
    f.id === fixId
      ? { ...f, status: 'applied' as const, appliedChangeEventId: newEvents[0]?.id, history: [...f.history, { at, action: touchedTools.length ? 'Applied (simulated publish)' : 'Marked as done (manual fix)', by: ACTOR }] }
      : f,
  );
  const next: AppData = { ...data, baseEntities: base, tools, fixes, changeEvents: [...data.changeEvents, ...newEvents] };
  // Re-evaluate straight away so the map and issues update; resolutions are credited to the next scan.
  const r = rescanInternal(next, metrics, { scanId: data.scans[0]?.id ?? 'live', at, trigger: 'on_demand', record: false });
  return { ...next, tools: r.tools, entities: r.entities, links: r.links, issues: r.issues, fixes: r.fixes, anomalies: r.anomalies, ruleResults: r.ruleResults };
}

export function setIssueDismissed(data: AppData, issueId: string, dismissed: boolean): AppData {
  return { ...data, issues: data.issues.map((i) => (i.id === issueId ? { ...i, status: dismissed ? 'dismissed' : 'open' } : i)) };
}

export function setAnomalyStatus(data: AppData, id: string, status: Anomaly['status']): AppData {
  return { ...data, anomalies: data.anomalies.map((a) => (a.id === id ? { ...a, status } : a)) };
}
