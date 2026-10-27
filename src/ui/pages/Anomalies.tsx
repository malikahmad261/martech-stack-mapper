import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Anomaly, AnomalyType, Entity } from '../../model/schema';
import { useEntityMap, useStore } from '../../store';
import { MetricChart, metricIndex, seriesFor, type Series } from '../components/Charts';
import { Badge, Button, Card, Drawer, EmptyState, EntityChip, PageHeader, SeverityBadge, Tabs } from '../components/common';
import { isActiveAnomaly } from '../derive';
import { ANOMALY, TOOLS, fmtDate, fmtDateTime, fmtNum, fmtPct } from '../meta';

const STATUS: Record<Anomaly['status'], { label: string; cls: string }> = {
  new: { label: 'New', cls: 'bg-white text-slate-700 ring-slate-300' },
  acknowledged: { label: 'Acknowledged', cls: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  expected: { label: 'Expected', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  resolved: { label: 'Resolved', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
};

function chartSeries(a: Anomaly, e: Entity): Series[] {
  const m = metricIndex;
  if (a.type !== 'tracking_outage') return seriesFor(e);
  const own: Series =
    e.kind === 'meta_event'
      ? a.metric === 'events'
        ? { key: 'own', label: `${e.name} events (Pixel + CAPI)`, values: m.sum([m.get(e.id, 'events_browser'), m.get(e.id, 'events_server')]), color: ANOMALY.tracking_outage.color }
        : { key: 'own', label: `${e.name} ${a.metric === 'events_server' ? 'server (CAPI)' : 'browser (Pixel)'} events`, values: m.get(e.id, a.metric), color: ANOMALY.tracking_outage.color }
      : { key: 'own', label: `${e.name} ${a.metric}`, values: m.get(e.id, a.metric), color: ANOMALY.tracking_outage.color };
  const kinds = e.tool === 'google_ads' ? 'gads_campaign' : e.tool === 'meta' ? 'meta_campaign' : null;
  const stream = 'ga4:stream:5566778899';
  const traffic: Series = kinds
    ? { key: 'traffic', label: `${TOOLS[e.tool].short} clicks`, values: m.sum(useStore.getState().entities.filter((x) => x.kind === kinds).map((c) => m.get(c.id, 'clicks'))), color: '#94a3b8', axis: 'right', dashed: true }
    : { key: 'traffic', label: 'GA4 sessions', values: m.sum(m.dimensionValues(stream, 'sessions', 'channel').map((ch) => m.get(stream, 'sessions', { channel: ch }))), color: '#94a3b8', axis: 'right', dashed: true };
  return [own, traffic];
}

function AnomalyCard({ a, onOpen, active }: { a: Anomaly; onOpen: () => void; active: boolean }) {
  const byId = useEntityMap();
  const e = byId.get(a.entityId);
  return (
    <button onClick={onOpen} className={clsx('flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50', active && 'bg-indigo-50/50')}>
      <span className={clsx('mt-0.5 w-14 shrink-0 text-right text-sm font-semibold tabular-nums', a.changePct < 0 ? 'text-rose-600' : 'text-emerald-600')}>{fmtPct(a.changePct)}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-900">{e?.name}</span>
          {e && <span className="text-xs text-slate-400">{TOOLS[e.tool].short}</span>}
        </span>
        <span className="mt-0.5 block text-xs text-slate-500">
          {fmtDate(`${a.window.start}T00:00:00Z`)} – {a.window.end === metricIndex.dates.at(-1) ? 'ongoing' : fmtDate(`${a.window.end}T00:00:00Z`)} · {a.signals[0]}
        </span>
      </span>
      <span className="hidden text-xs text-slate-400 sm:block">{Math.round(a.confidence * 100)}% confidence</span>
      <Badge className={STATUS[a.status].cls}>{STATUS[a.status].label}</Badge>
      <ChevronRight size={16} className="mt-0.5 shrink-0 text-slate-300" />
    </button>
  );
}

export function Anomalies() {
  const [params, setParams] = useSearchParams();
  const anomalies = useStore((s) => s.anomalies);
  const type = (params.get('type') as AnomalyType) ?? 'tracking_outage';
  const selected = params.get('id');
  const list = anomalies.filter((a) => a.type === type);
  const active = list.filter(isActiveAnomaly);
  const closed = list.filter((a) => !isActiveAnomaly(a));

  return (
    <div>
      <PageHeader
        title="Data anomalies"
        subtitle="Daily metrics compared with the same weekday over the previous four weeks. Each anomaly is classified by what caused it, because each type needs a different response."
      />
      <Card>
        <div className="px-4 pt-2">
          <Tabs
            value={type}
            onChange={(t) => setParams({ type: t })}
            tabs={(['tracking_outage', 'bot_traffic', 'spend_driven'] as const).map((t) => ({ id: t, label: ANOMALY[t].label, count: anomalies.filter((a) => a.type === t && isActiveAnomaly(a)).length }))}
          />
        </div>
        <p className="border-b border-slate-100 px-4 py-2.5 text-sm text-slate-600">{ANOMALY[type].description}</p>
        {list.length === 0 && (
          <div className="p-4">
            <EmptyState>No anomalies of this type.</EmptyState>
          </div>
        )}
        <ul className="divide-y divide-slate-100">
          {active.map((a) => (
            <li key={a.id}>
              <AnomalyCard a={a} active={selected === a.id} onOpen={() => setParams({ type, id: a.id })} />
            </li>
          ))}
        </ul>
        {closed.length > 0 && (
          <>
            <div className="bg-slate-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Resolved / expected · {closed.length}</div>
            <ul className="divide-y divide-slate-100 opacity-80">
              {closed.map((a) => (
                <li key={a.id}>
                  <AnomalyCard a={a} active={selected === a.id} onOpen={() => setParams({ type, id: a.id })} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <Drawer open={!!selected} onClose={() => setParams({ type })} wide>
        {selected && <AnomalyDetail id={selected} />}
      </Drawer>
    </div>
  );
}

function AnomalyDetail({ id }: { id: string }) {
  const a = useStore((s) => s.anomalies.find((x) => x.id === id));
  const changeEvents = useStore((s) => s.changeEvents);
  const issues = useStore((s) => s.issues);
  const anomalies = useStore((s) => s.anomalies);
  const setStatus = useStore((s) => s.setAnomalyStatus);
  const byId = useEntityMap();
  const related = useMemo(
    () => (a ? anomalies.filter((x) => x.id !== a.id && x.likelyCause.changeEventIds.some((c) => a.likelyCause.changeEventIds.includes(c))) : []),
    [a, anomalies],
  );
  if (!a) return <div className="p-6 text-sm text-slate-500">Anomaly not found.</div>;
  const e = byId.get(a.entityId)!;
  const causes = changeEvents.filter((c) => a.likelyCause.changeEventIds.includes(c.id));
  const linkedIssues = issues.filter((i) => a.likelyCause.issueIds.includes(i.id));
  const markers = causes.map((c) => ({ date: c.at.slice(0, 10), label: c.kind === 'gtm_publish' ? `${TOOLS[c.tool].short} ${c.summary.match(/v\d+/)?.[0] ?? ''}` : c.kind === 'budget_change' ? 'Budget change' : c.kind === 'status_change' ? 'Status change' : 'Config change' }));

  return (
    <div className="space-y-6 p-6">
      <div className="pr-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={ANOMALY[a.type].badge}>{ANOMALY[a.type].label}</Badge>
          <Badge className={STATUS[a.status].cls}>{STATUS[a.status].label}</Badge>
          <span className="text-xs text-slate-500">{Math.round(a.confidence * 100)}% confidence</span>
        </div>
        <h2 className="mt-2 text-lg font-semibold text-slate-900">
          {e.name}: {fmtPct(a.changePct)} {a.metric.replace('_', ' ')}
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <EntityChip entity={e} showKind />
          <span>
            {a.window.start} → {a.window.end === metricIndex.dates.at(-1) ? 'ongoing' : a.window.end}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-xs text-slate-500">Expected / day</div>
          <div className="text-lg font-semibold tabular-nums">{fmtNum(a.baseline)}</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-xs text-slate-500">Observed / day</div>
          <div className="text-lg font-semibold tabular-nums">{fmtNum(a.observed)}</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-xs text-slate-500">Change</div>
          <div className={clsx('text-lg font-semibold tabular-nums', a.changePct < 0 ? 'text-rose-600' : 'text-emerald-600')}>{fmtPct(a.changePct)}</div>
        </div>
      </div>

      <MetricChart series={chartSeries(a, e)} window={a.window} windowColor={ANOMALY[a.type].color} markers={markers} height={240} />

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Signals</h3>
        <ul className="space-y-1 text-sm text-slate-700">
          {a.signals.map((s) => (
            <li key={s} className="flex gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
              {s}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Likely cause</h3>
        <p className="text-sm leading-relaxed text-slate-700">{a.likelyCause.explanation}</p>
        {causes.map((c) => (
          <div key={c.id} className="mt-3 rounded-lg border border-slate-200 p-3 text-sm">
            <div className="font-medium text-slate-900">{c.summary}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              {TOOLS[c.tool].label} · {fmtDateTime(c.at)} · {c.actor}
            </div>
            {Array.isArray(c.after) && (
              <ul className="mt-1.5 text-xs">
                {(c.after as { entity: string; field: string; value: unknown }[]).map((x, i) => (
                  <li key={i} className="font-mono text-slate-600">
                    {x.entity} · {x.field}: <span className="text-rose-600 line-through">{String((c.before as { value: unknown }[])[i]?.value ?? '∅')}</span> → {String(x.value ?? '∅')}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {linkedIssues.map((i) => (
          <Link key={i.id} to={`/issues?id=${encodeURIComponent(i.id)}`} className="mt-3 flex items-start gap-2 rounded-lg border border-rose-100 bg-rose-50/60 p-3 text-sm hover:border-rose-300">
            <SeverityBadge severity={i.severity} />
            <span className="flex-1">{i.title}</span>
            <ChevronRight size={16} className="text-slate-400" />
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Recommended action</div>
        <p className="mt-1 text-sm text-slate-700">{a.recommendation}</p>
      </div>

      {related.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Same root cause</h3>
          <div className="flex flex-wrap gap-1.5">
            {related.map((r) => (
              <EntityChip key={r.id} id={r.entityId} />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        {a.status !== 'acknowledged' && <Button onClick={() => setStatus(a.id, 'acknowledged')}>Acknowledge</Button>}
        {a.type === 'spend_driven' && a.status !== 'expected' && <Button onClick={() => setStatus(a.id, 'expected')}>Mark as expected</Button>}
        {a.status !== 'resolved' && <Button onClick={() => setStatus(a.id, 'resolved')}>Mark resolved</Button>}
        {a.status !== 'new' && (
          <Button variant="ghost" onClick={() => setStatus(a.id, 'new')}>
            Reset status
          </Button>
        )}
      </div>
    </div>
  );
}
