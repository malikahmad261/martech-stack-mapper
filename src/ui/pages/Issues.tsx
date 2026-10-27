import clsx from 'clsx';
import { CheckCircle2, ChevronRight, Wrench } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { RULES } from '../../engine/rules';
import type { Issue, IssueCategory } from '../../model/schema';
import { useEntityMap, useStore } from '../../store';
import { Badge, Button, Card, Drawer, EmptyState, EntityChip, KeyValue, PageHeader, SeverityBadge, Tabs } from '../components/common';
import { LineageSections } from '../components/Lineage';
import { isActiveIssue } from '../derive';
import { CATEGORY, SEVERITY, fmtDate } from '../meta';

const STATUS_LABEL: Record<Issue['status'], { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-white text-slate-700 ring-slate-300' },
  fix_pending: { label: 'Fix approved', cls: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  resolved: { label: 'Resolved', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  dismissed: { label: 'Dismissed', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
};

export function IssueStatus({ issue }: { issue: Issue }) {
  const s = STATUS_LABEL[issue.status];
  return <Badge className={s.cls}>{issue.status === 'resolved' && issue.verification === 'pending_data' ? 'Resolved — verifying with next data' : s.label}</Badge>;
}

const sevOrder = (i: Issue) => Object.keys(SEVERITY).indexOf(i.severity);

export function Issues() {
  const [params, setParams] = useSearchParams();
  const issues = useStore((s) => s.issues);
  const ruleResults = useStore((s) => s.ruleResults);
  const view = params.get('view') ?? 'active';
  const selected = params.get('id');

  const list = useMemo(() => {
    const f = issues.filter((i) => (view === 'active' ? isActiveIssue(i) : view === 'resolved' ? i.status === 'resolved' : view === 'dismissed' ? i.status === 'dismissed' : true));
    return [...f].sort((a, b) => sevOrder(a) - sevOrder(b));
  }, [issues, view]);
  const grouped = (Object.keys(CATEGORY) as IssueCategory[]).map((c) => ({ c, items: list.filter((i) => i.category === c) })).filter((g) => g.items.length);
  const passing = ruleResults.filter((r) => r.passed);

  return (
    <div>
      <PageHeader
        title="Integration issues"
        subtitle={`${RULES.length} checks run on every scan across conversion tracking, cookies and click IDs, consent, configuration and data quality. Each issue comes with evidence, a diagnosis and a recommended fix.`}
      />
      <Card>
        <div className="px-4 pt-2">
          <Tabs
            value={view}
            onChange={(v) => setParams(v === 'active' ? {} : { view: v })}
            tabs={[
              { id: 'active', label: 'Open', count: issues.filter(isActiveIssue).length },
              { id: 'resolved', label: 'Resolved', count: issues.filter((i) => i.status === 'resolved').length },
              { id: 'dismissed', label: 'Dismissed', count: issues.filter((i) => i.status === 'dismissed').length },
              { id: 'passing', label: 'Passing checks', count: passing.length },
            ]}
          />
        </div>
        {view === 'passing' ? (
          <ul className="divide-y divide-slate-100">
            {passing.map((r) => {
              const rule = RULES.find((x) => x.id === r.ruleId)!;
              return (
                <li key={r.ruleId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
                  <span className="w-12 shrink-0 font-mono text-xs text-slate-400">{rule.id}</span>
                  <span className="flex-1 text-slate-700">{rule.name}</span>
                  <span className="hidden text-xs text-slate-400 sm:block">{CATEGORY[rule.category]}</span>
                </li>
              );
            })}
          </ul>
        ) : grouped.length === 0 ? (
          <div className="p-4">
            <EmptyState>No issues in this view.</EmptyState>
          </div>
        ) : (
          grouped.map(({ c, items }) => (
            <div key={c}>
              <div className="bg-slate-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {CATEGORY[c]} · {items.length}
              </div>
              <ul className="divide-y divide-slate-100">
                {items.map((i) => (
                  <li key={i.id}>
                    <button onClick={() => setParams({ ...(view !== 'active' ? { view } : {}), id: i.id })} className={clsx('flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50', selected === i.id && 'bg-indigo-50/50')}>
                      <SeverityBadge severity={i.severity} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-900">{i.title}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          <span className="font-mono">{i.ruleId}</span> · first detected {fmtDate(i.firstDetectedScanId.slice(5, 15))} · {i.entityIds.length} entities affected
                        </span>
                      </span>
                      <IssueStatus issue={i} />
                      <ChevronRight size={16} className="mt-0.5 shrink-0 text-slate-300" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </Card>
      <Drawer open={!!selected} onClose={() => setParams(view !== 'active' ? { view } : {})} wide>
        {selected && <IssueDetail id={selected} />}
      </Drawer>
    </div>
  );
}

export function IssueDetail({ id }: { id: string }) {
  const issue = useStore((s) => s.issues.find((i) => i.id === id));
  const fix = useStore((s) => s.fixes.find((f) => f.id === issue?.fixId));
  const allAnomalies = useStore((s) => s.anomalies);
  const anomalies = useMemo(() => allAnomalies.filter((a) => a.likelyCause.issueIds.includes(id)), [allAnomalies, id]);
  const setDismissed = useStore((s) => s.setIssueDismissed);
  const byId = useEntityMap();
  if (!issue) return <div className="p-6 text-sm text-slate-500">Issue not found.</div>;
  const rule = RULES.find((r) => r.id === issue.ruleId)!;
  const primary = byId.get(issue.entityIds[0]);

  return (
    <div className="space-y-6 p-6">
      <div className="pr-8">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={issue.severity} />
          <IssueStatus issue={issue} />
          <span className="text-xs text-slate-500">
            <span className="font-mono">{rule.id}</span> · {CATEGORY[rule.category]}
          </span>
        </div>
        <h2 className="mt-2 text-lg font-semibold leading-snug text-slate-900">{issue.title}</h2>
        <p className="mt-1 text-xs text-slate-500">Check: {rule.name}</p>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Affected</h3>
        <div className="flex flex-wrap gap-1.5">
          {issue.entityIds.map((e) => (
            <EntityChip key={e} id={e} showKind />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence</h3>
        <div className="rounded-lg border border-slate-200 px-3">
          <KeyValue rows={Object.entries(issue.evidence).map(([k, v]) => [k, String(v)])} />
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Diagnosis</h3>
        <p className="text-sm leading-relaxed text-slate-700">{issue.diagnosis}</p>
      </div>

      {fix && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Recommended fix</div>
              <div className="mt-1 font-medium text-slate-900">{fix.title}</div>
              <p className="mt-1 text-sm text-slate-600">{fix.rationale}</p>
            </div>
            <Link to={`/fixes?id=${encodeURIComponent(fix.id)}`}>
              <Button variant="primary">
                <Wrench size={14} />
                {fix.status === 'applied' ? 'View applied fix' : 'Review fix'}
              </Button>
            </Link>
          </div>
          {fix.issueIds.length > 1 && <p className="mt-2 text-xs text-slate-500">This fix also resolves {fix.issueIds.length - 1} other issue(s).</p>}
        </div>
      )}

      {anomalies.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Linked anomalies</h3>
          <ul className="space-y-1.5">
            {anomalies.map((a) => (
              <li key={a.id}>
                <Link to={`/anomalies?type=${a.type}&id=${encodeURIComponent(a.id)}`} className="text-sm text-indigo-700 hover:underline">
                  {byId.get(a.entityId)?.name}: {Math.round(a.changePct * 100)}% from {a.window.start}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {primary && (
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Where it sits in the stack — {primary.name}</h3>
          <LineageSections entityId={primary.id} highlightLinks={new Set(issue.linkIds)} />
        </div>
      )}

      <div className="flex gap-2 border-t border-slate-100 pt-4">
        {issue.status === 'dismissed' ? (
          <Button onClick={() => setDismissed(issue.id, false)}>Reopen</Button>
        ) : isActiveIssue(issue) ? (
          <Button variant="ghost" onClick={() => setDismissed(issue.id, true)}>
            Dismiss issue
          </Button>
        ) : null}
      </div>
    </div>
  );
}
