import clsx from 'clsx';
import { CheckCircle2, ChevronRight, GitCommitHorizontal, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { ContextItem } from '../../assistant/context';
import { RULES } from '../../engine/rules';
import { isActiveProblem, problemIdFor, type Problem } from '../../insights/problems';
import type { Anomaly, Entity } from '../../model/schema';
import { useEntityMap, useStore } from '../../store';
import { useDetailed, useRole } from '../../store/ui';
import { AddToChat, Checkbox, SelectionBar } from '../components/AddToChat';
import { MetricChart, metricIndex, seriesFor, type Series } from '../components/Charts';
import { Button, EmptyState, EntityChip, KeyValue, PlainSeverity, ProblemStatusBadge, SectionTitle, Technical, ToolDots } from '../components/common';
import { FixCard, FixChangesEditor, FixHistory } from '../components/FixPanel';
import { LineageSections } from '../components/Lineage';
import { problemPath, useProblems } from '../hooks';
import { ANOMALY, CATEGORY, TOOLS, fmtDate, fmtDateTime, fmtNum, fmtPct } from '../meta';

type View = 'open' | 'review' | 'closed';

const SEVERITY_BAR: Record<Problem['severity'], string> = { critical: 'bg-rose-600', high: 'bg-rose-400', medium: 'bg-amber-400', low: 'bg-slate-300' };

function inView(p: Problem, view: View) {
  if (view === 'review') return p.status === 'review_requested' || p.status === 'approved';
  if (view === 'closed') return !isActiveProblem(p);
  return isActiveProblem(p);
}

export function Problems() {
  const { id: rawId } = useParams();
  const id = rawId ? decodeURIComponent(rawId) : undefined;
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const problems = useProblems();
  const detailed = useDetailed();
  const role = useRole();
  const [q, setQ] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const view = (params.get('view') as View) ?? 'open';

  const counts = {
    open: problems.filter((p) => inView(p, 'open') && !p.fyi).length,
    review: problems.filter((p) => inView(p, 'review')).length,
    closed: problems.filter((p) => inView(p, 'closed')).length,
  };
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return problems.filter((p) => inView(p, view) && (!ql || `${p.headline} ${p.technicalTitle} ${p.ruleId ?? ''}`.toLowerCase().includes(ql)));
  }, [problems, view, q]);
  const main = list.filter((p) => !p.fyi || view !== 'open');
  const fyi = view === 'open' ? list.filter((p) => p.fyi) : [];
  const selected = problems.find((p) => p.id === id);

  // Desktop master–detail: always show something on the right.
  useEffect(() => {
    if (!id && main[0]) navigate(problemPath(main[0].id) + (view !== 'open' ? `?view=${view}` : ''), { replace: true });
  }, [id, main, navigate, view]);

  const toggle = (pid: string) => setChecked((s) => {
    const n = new Set(s);
    if (n.has(pid)) n.delete(pid);
    else n.add(pid);
    return n;
  });
  const go = (p: Problem) => navigate(problemPath(p.id) + (view !== 'open' ? `?view=${view}` : ''));

  const Row = ({ p }: { p: Problem }) => (
    <li>
      <div
        onClick={() => go(p)}
        className={clsx('group flex cursor-pointer items-start gap-2.5 border-l-[3px] py-2.5 pl-2.5 pr-3', p.id === id ? 'border-l-indigo-500 bg-indigo-50/70' : 'border-l-transparent hover:bg-slate-50')}
      >
        <span className="pt-0.5">
          <Checkbox checked={checked.has(p.id)} onChange={() => toggle(p.id)} label={`Select ${p.headline}`} />
        </span>
        <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', p.fyi ? 'bg-sky-400' : SEVERITY_BAR[p.severity])} title={p.severity} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium leading-snug text-slate-900">{p.headline}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            {detailed && p.ruleId && <span className="font-mono text-slate-400">{p.ruleId}</span>}
            <ToolDots tools={p.tools} />
            {p.status !== 'open' && <ProblemStatusBadge status={p.status} />}
          </span>
          {detailed && <span className="mt-1 block truncate text-xs text-slate-400">{p.technicalTitle}</span>}
        </span>
      </div>
    </li>
  );

  const groups = (['critical', 'high', 'medium', 'low'] as const).map((s) => ({ s, items: main.filter((p) => p.severity === s) })).filter((g) => g.items.length);
  const checkedItems: ContextItem[] = [...checked].filter((c) => problems.some((p) => p.id === c)).map((c) => ({ kind: 'problem', id: c }));

  return (
    <div className="flex h-[calc(100vh-var(--header-h))]">
      <div className="flex w-[380px] shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="space-y-2.5 border-b border-slate-100 px-4 pb-2 pt-5">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Problems</h1>
          <div className="flex gap-1 text-sm">
            {(
              [
                ['open', 'Open'],
                ['review', role === 'consultant' ? 'To review' : 'In review'],
                ['closed', 'Closed'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setParams(v === 'open' ? {} : { view: v })}
                className={clsx('flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 font-medium', view === v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}
              >
                {label}
                <span className={clsx('rounded-full px-1.5 text-xs', view === v ? 'bg-white/20' : v === 'review' && counts.review ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500')}>{counts[v]}</span>
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus-within:border-slate-400">
            <Search size={14} className="text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter problems" className="w-full outline-none" />
          </label>
        </div>
        <div className="flex-1 overflow-y-auto pb-16">
          {groups.map(({ s, items }) => (
            <div key={s}>
              <div className="sticky top-0 z-[1] flex items-center gap-2 bg-slate-50/95 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 backdrop-blur">
                <PlainSeverity severity={s} /> <span>{items.length}</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {items.map((p) => (
                  <Row key={p.id} p={p} />
                ))}
              </ul>
            </div>
          ))}
          {fyi.length > 0 && (
            <div>
              <div className="sticky top-0 z-[1] bg-slate-50/95 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500" title="Changes explained by a deliberate change such as a budget edit">
                Explained changes · no action needed
              </div>
              <ul className="divide-y divide-slate-100">
                {fyi.map((p) => (
                  <Row key={p.id} p={p} />
                ))}
              </ul>
            </div>
          )}
          {!main.length && !fyi.length && (
            <div className="p-4">
              <EmptyState>{view === 'review' ? 'Nothing waiting for review.' : view === 'closed' ? 'Nothing fixed or closed yet.' : 'No open problems.'}</EmptyState>
            </div>
          )}
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto">
        {selected ? <ProblemDetail key={selected.id} p={selected} /> : id ? <div className="p-8 text-sm text-slate-500">This problem no longer exists — it may have been fixed and re-scanned.</div> : null}
      </div>
      <SelectionBar items={checkedItems} onClear={() => setChecked(new Set())} noun="problem" />
    </div>
  );
}

function anomalySeries(a: Anomaly, e: Entity): Series[] {
  const m = metricIndex;
  if (a.type !== 'tracking_outage') return seriesFor(e);
  const own: Series =
    e.kind === 'meta_event'
      ? { key: 'own', label: `${e.name} (${a.metric === 'events_server' ? 'server' : a.metric === 'events_browser' ? 'browser' : 'Pixel + CAPI'})`, values: a.metric === 'events' ? m.sum([m.get(e.id, 'events_browser'), m.get(e.id, 'events_server')]) : m.get(e.id, a.metric), color: ANOMALY.tracking_outage.color }
      : { key: 'own', label: `${e.name} ${a.metric}`, values: m.get(e.id, a.metric), color: ANOMALY.tracking_outage.color };
  const kinds = e.tool === 'google_ads' ? 'gads_campaign' : e.tool === 'meta' ? 'meta_campaign' : null;
  const stream = useStore.getState().entities.find((x) => x.kind === 'ga4_stream')?.id ?? '';
  const traffic: Series = kinds
    ? { key: 'traffic', label: `${TOOLS[e.tool].short} clicks (traffic)`, values: m.sum(useStore.getState().entities.filter((x) => x.kind === kinds).map((c) => m.get(c.id, 'clicks'))), color: '#94a3b8', axis: 'right', dashed: true }
    : { key: 'traffic', label: 'GA4 sessions (traffic)', values: m.sum(m.dimensionValues(stream, 'sessions', 'channel').map((ch) => m.get(stream, 'sessions', { channel: ch }))), color: '#94a3b8', axis: 'right', dashed: true };
  return [own, traffic];
}

function ProblemDetail({ p }: { p: Problem }) {
  const byId = useEntityMap();
  const changeEvents = useStore((s) => s.changeEvents);
  const { setIssueDismissed, setAnomalyStatus } = useStore.getState();
  const detailed = useDetailed();
  const location = useLocation();
  const rule = p.ruleId ? RULES.find((r) => r.id === p.ruleId) : undefined;
  const [chartIdx, setChartIdx] = useState(0);
  const anomaly = p.anomalies[Math.min(chartIdx, p.anomalies.length - 1)];
  const anomalyEntity = anomaly ? byId.get(anomaly.entityId) : undefined;
  const causes = changeEvents.filter((c) => p.anomalies.some((a) => a.likelyCause.changeEventIds.includes(c.id)));
  const primary = p.entityIds.map((eid) => byId.get(eid)).find((e) => e && e.tool !== 'site');

  useEffect(() => {
    if (location.hash === '#fix') document.getElementById('fix')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash]);

  const markers = causes.map((c) => ({ date: c.at.slice(0, 10), label: c.kind === 'gtm_publish' ? `${TOOLS[c.tool].short} ${c.summary.match(/v\d+/)?.[0] ?? ''}` : c.kind === 'budget_change' ? 'Budget change' : c.kind === 'status_change' ? 'Status change' : 'Config change' }));

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          {p.fyi ? <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-200">For information</span> : <PlainSeverity severity={p.severity} />}
          {p.status !== 'open' && <ProblemStatusBadge status={p.status} />}
          <ToolDots tools={p.tools} />
          <span className="text-xs text-slate-400">{p.source === 'issue' ? 'detected' : 'from'} {fmtDate(`${p.detectedOn}T00:00:00Z`)}</span>
          <div className="ml-auto">
            <AddToChat item={{ kind: 'problem', id: p.id }} variant="button" />
          </div>
        </div>
        <h2 className="mt-2 text-xl font-semibold leading-snug text-slate-900">{p.headline}</h2>
        {detailed && (
          <p className="mt-1 text-xs text-slate-500">
            {p.ruleId && <span className="font-mono">{p.ruleId} · </span>}
            {p.technicalTitle}
          </p>
        )}
      </div>

      <div>
        <SectionTitle>What's happening</SectionTitle>
        <p className="text-[15px] leading-relaxed text-slate-700">{p.impact}</p>
      </div>

      {anomaly && anomalyEntity && (
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-medium text-slate-900">{anomalyEntity.name}</div>
              <div className="text-xs text-slate-500">
                {TOOLS[anomalyEntity.tool].label} · normally {fmtNum(anomaly.baseline)}/day, now {fmtNum(anomaly.observed)}/day{' '}
                <span className={clsx('font-semibold', anomaly.changePct < 0 ? 'text-rose-600' : 'text-emerald-600')}>({fmtPct(anomaly.changePct)})</span>
              </div>
            </div>
            {p.anomalies.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {p.anomalies.map((a, i) => (
                  <button key={a.id} onClick={() => setChartIdx(i)} className={clsx('rounded-md px-2 py-0.5 text-xs', i === chartIdx ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                    {byId.get(a.entityId)?.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <MetricChart series={anomalySeries(anomaly, anomalyEntity)} window={anomaly.window} windowColor={ANOMALY[anomaly.type].color} markers={markers} height={220} selectFor={anomalyEntity.id} />
        </div>
      )}

      {causes.length > 0 && (
        <div>
          <SectionTitle>Likely cause</SectionTitle>
          {causes.map((c) => (
            <div key={c.id} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
              <GitCommitHorizontal size={16} className="mt-0.5 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-medium text-slate-900">{c.summary}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {TOOLS[c.tool].label} · {fmtDateTime(c.at)} · {c.actor}
                </div>
                {detailed && Array.isArray(c.after) && (
                  <ul className="mt-1.5 text-xs">
                    {(c.after as { entity: string; field: string; value: unknown }[]).map((x, i) => (
                      <li key={i} className="font-mono text-slate-600">
                        {x.entity} · {x.field}: <span className="text-rose-600 line-through">{String((c.before as { value: unknown }[])[i]?.value ?? '∅')}</span> → {String(x.value ?? '∅')}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <AddToChat item={{ kind: 'change', id: c.id }} />
            </div>
          ))}
        </div>
      )}

      {p.fix ? (
        <div id="fix" className="scroll-mt-4">
          <FixCard fix={p.fix} />
        </div>
      ) : (
        p.anomalies[0] && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">{p.fyi ? 'Why this is expected' : 'What to do'}</div>
            <p className="mt-1 text-sm text-slate-700">{p.fyi ? p.anomalies[0].likelyCause.explanation : p.anomalies[0].recommendation}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {p.status === 'open' && p.fyi && <Button onClick={() => setAnomalyStatus(p.anomalies[0].id, 'expected')}>Mark as expected</Button>}
              {p.status === 'open' && !p.fyi && <Button onClick={() => setAnomalyStatus(p.anomalies[0].id, 'resolved')}>Mark as handled</Button>}
              {p.status !== 'open' && <Button variant="ghost" onClick={() => setAnomalyStatus(p.anomalies[0].id, 'new')}>Reopen</Button>}
            </div>
          </div>
        )
      )}

      <Technical summary={[p.ruleId, primary?.name].filter(Boolean).join(' · ')}>
        {rule && (
          <div>
            <SectionTitle>Check</SectionTitle>
            <p className="text-sm text-slate-700">
              <span className="font-mono text-xs text-slate-500">{rule.id}</span> · {CATEGORY[rule.category]} — {rule.name}
            </p>
          </div>
        )}
        {p.issue && (
          <div>
            <SectionTitle>Diagnosis</SectionTitle>
            <p className="text-sm leading-relaxed text-slate-700">{p.issue.diagnosis}</p>
          </div>
        )}
        {p.issue && Object.keys(p.issue.evidence).length > 0 && (
          <div>
            <SectionTitle>Evidence</SectionTitle>
            <div className="rounded-lg border border-slate-200 px-3">
              <KeyValue rows={Object.entries(p.issue.evidence).map(([k, v]) => [k, String(v)])} />
            </div>
          </div>
        )}
        {!p.issue && p.anomalies[0] && (
          <div>
            <SectionTitle>Signals</SectionTitle>
            <ul className="space-y-1 text-sm text-slate-700">
              {p.anomalies[0].signals.map((s) => (
                <li key={s} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                  {s}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">
              Expected {fmtNum(p.anomalies[0].baseline)}/day · observed {fmtNum(p.anomalies[0].observed)}/day · {Math.round(p.anomalies[0].confidence * 100)}% confidence · {ANOMALY[p.anomalies[0].type].label}
            </p>
          </div>
        )}
        <div>
          <SectionTitle>Affected</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {p.entityIds.map((e) => (
              <span key={e} className="inline-flex items-center gap-0.5">
                <EntityChip id={e} showKind />
                <AddToChat item={{ kind: 'entity', id: e }} />
              </span>
            ))}
          </div>
        </div>
        {primary && (
          <div>
            <SectionTitle>Where it sits in the stack — {primary.name}</SectionTitle>
            <LineageSections entityId={primary.id} highlightLinks={new Set(p.issue?.linkIds ?? [])} />
          </div>
        )}
        {p.fix && (
          <>
            <FixChangesEditor fix={p.fix} />
            <div>
              <SectionTitle>Fix history</SectionTitle>
              <FixHistory fix={p.fix} />
            </div>
          </>
        )}
      </Technical>

      {p.issue && (
        <div className="flex gap-2 border-t border-slate-100 pt-4">
          {p.status === 'dismissed' ? (
            <Button onClick={() => setIssueDismissed(p.issue!.id, false)}>Reopen</Button>
          ) : isActiveProblem(p) ? (
            <Button variant="ghost" onClick={() => setIssueDismissed(p.issue!.id, true)}>
              Dismiss — not a problem for us
            </Button>
          ) : (
            <span className="flex items-center gap-1.5 text-sm text-emerald-700">
              <CheckCircle2 size={14} /> {p.status === 'verifying' ? 'Fixed — confirming with the next data' : 'Fixed'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Old routes (/issues, /anomalies, /fixes) now land on the matching problem. */
export function LegacyRedirect({ kind }: { kind: 'issues' | 'anomalies' | 'fixes' }) {
  const [params] = useSearchParams();
  const problems = useProblems();
  const id = params.get('id');
  const pid = id ? problemIdFor(problems, kind === 'issues' ? { issueId: id } : kind === 'anomalies' ? { anomalyId: id } : { fixId: id }) : undefined;
  return <Navigate to={pid ? problemPath(pid) : kind === 'fixes' ? '/problems?view=review' : '/problems'} replace />;
}

export function ProblemLink({ p }: { p: Problem }) {
  return (
    <Link to={problemPath(p.id)} className="flex items-start gap-2 rounded-lg border border-slate-200 p-2.5 text-sm hover:border-slate-400">
      <PlainSeverity severity={p.severity} />
      <span className="flex-1 text-slate-800">{p.headline}</span>
      <ChevronRight size={16} className="mt-0.5 text-slate-400" />
    </Link>
  );
}
