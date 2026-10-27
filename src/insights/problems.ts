import type { Anomaly, Entity, Fix, Issue, Severity, ToolId } from '../model/schema';
import { plainAnomaly, plainIssue } from './plain';

// A Problem is the one thing a person acts on. The engine reports the same underlying fault several
// ways — an issue from a rule, the anomalies it caused in the data, and a recommended fix — so the UI
// folds them together. Anomalies with no matching issue (bot traffic, budget changes) stand alone.

export type ProblemStatus = 'open' | 'review_requested' | 'approved' | 'fixed' | 'verifying' | 'dismissed' | 'expected';

export interface Problem {
  id: string;
  source: 'issue' | 'anomaly';
  issue?: Issue;
  /** Anomalies this problem caused (or, for an anomaly-only problem, the anomaly itself). */
  anomalies: Anomaly[];
  fix?: Fix;
  severity: Severity;
  status: ProblemStatus;
  /** Informational: explained by a deliberate change, nothing to fix. */
  fyi: boolean;
  headline: string;
  impact: string;
  /** Technical title from the rule or detector. */
  technicalTitle: string;
  ruleId?: string;
  entityIds: string[];
  tools: ToolId[];
  detectedOn: string; // YYYY-MM-DD
}

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];
export const isActiveProblem = (p: Problem) => p.status === 'open' || p.status === 'review_requested' || p.status === 'approved';

function issueStatus(i: Issue, fix?: Fix): ProblemStatus {
  if (i.status === 'dismissed') return 'dismissed';
  if (i.status === 'resolved') return i.verification === 'pending_data' ? 'verifying' : 'fixed';
  if (fix?.status === 'approved') return 'approved';
  if (fix?.reviewRequest && (fix.status === 'draft' || fix.status === 'edited')) return 'review_requested';
  return 'open';
}

function anomalyStatus(a: Anomaly): ProblemStatus {
  return a.status === 'resolved' ? 'fixed' : a.status === 'expected' ? 'expected' : 'open';
}

const ANOMALY_SEVERITY: Record<Anomaly['type'], Severity> = { tracking_outage: 'high', bot_traffic: 'high', spend_driven: 'low' };

export function buildProblems(data: { issues: Issue[]; anomalies: Anomaly[]; fixes: Fix[]; entities: Entity[] }): Problem[] {
  const byId = new Map(data.entities.map((e) => [e.id, e]));
  const fixById = new Map(data.fixes.map((f) => [f.id, f]));
  const toolsOf = (ids: string[]) => [...new Set(ids.map((id) => byId.get(id)?.tool).filter((t): t is ToolId => !!t && t !== 'site'))];
  const issueIds = new Set(data.issues.map((i) => i.id));
  const out: Problem[] = [];

  for (const i of data.issues) {
    const fix = i.fixId ? fixById.get(i.fixId) : undefined;
    const anomalies = data.anomalies.filter((a) => a.likelyCause.issueIds.includes(i.id));
    const copy = plainIssue(i, byId, anomalies);
    out.push({
      id: i.id,
      source: 'issue',
      issue: i,
      anomalies,
      fix,
      severity: i.severity,
      status: issueStatus(i, fix),
      fyi: false,
      headline: copy.headline,
      impact: copy.impact,
      technicalTitle: i.title,
      ruleId: i.ruleId,
      entityIds: i.entityIds,
      tools: toolsOf(i.entityIds),
      detectedOn: i.firstDetectedScanId.slice(5, 15),
    });
  }

  for (const a of data.anomalies) {
    if (a.likelyCause.issueIds.some((id) => issueIds.has(id))) continue;
    const e = byId.get(a.entityId);
    const copy = plainAnomaly(a, e);
    out.push({
      id: a.id,
      source: 'anomaly',
      anomalies: [a],
      severity: ANOMALY_SEVERITY[a.type],
      status: anomalyStatus(a),
      fyi: a.type === 'spend_driven',
      headline: copy.headline,
      impact: copy.impact,
      technicalTitle: `${e?.name ?? a.entityId}: ${Math.round(a.changePct * 100)}% ${a.metric.replace('_', ' ')} (${a.type.replace('_', ' ')})`,
      entityIds: [a.entityId],
      tools: toolsOf([a.entityId]),
      detectedOn: a.window.start,
    });
  }

  return out.sort((x, y) => Number(x.fyi) - Number(y.fyi) || SEVERITY_ORDER.indexOf(x.severity) - SEVERITY_ORDER.indexOf(y.severity));
}

/** Which problem shows a given issue, anomaly or fix (for old links and cross-references). */
export function problemIdFor(problems: Problem[], ref: { issueId?: string; anomalyId?: string; fixId?: string }): string | undefined {
  if (ref.issueId) return problems.find((p) => p.issue?.id === ref.issueId)?.id;
  if (ref.fixId) return problems.find((p) => p.fix?.id === ref.fixId)?.id;
  if (ref.anomalyId) return problems.find((p) => p.anomalies.some((a) => a.id === ref.anomalyId))?.id;
  return undefined;
}

/** Can this role apply the fix without a consultant? Clients may apply low-risk fixes only. */
export function canApplyDirectly(role: 'client' | 'consultant', fix: Fix) {
  return role === 'consultant' || fix.risk === 'low';
}
