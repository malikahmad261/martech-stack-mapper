import clsx from 'clsx';
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronRight, Info, Sparkles } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { CELL_STATE, PLATFORMS, type CellState, type ConversionCell, type ConversionRow, type Platform } from '../../insights/conversions';
import { overallSentence } from '../../insights/plain';
import { isActiveProblem, SEVERITY_ORDER, type Problem } from '../../insights/problems';
import type { Severity } from '../../model/schema';
import { useStore } from '../../store';
import { useDetailed, useRole, useUi } from '../../store/ui';
import { AddToChat } from '../components/AddToChat';
import { MetricChart, type Series } from '../components/Charts';
import { Card, Drawer, EntityChip, PlainSeverity, SectionTitle, Sparkline, Technical } from '../components/common';
import { Journey } from '../components/Journey';
import { LineageSections } from '../components/Lineage';
import { healthScore, scoreColor } from '../derive';
import { problemPath, useConversionGrid, useProblems } from '../hooks';
import { TOOLS, fmtDateTime, fmtPct } from '../meta';
import { ProblemLink } from './Problems';

const PLATFORM_LABEL: Record<Platform, string> = { ga4: 'Google Analytics 4', google_ads: 'Google Ads', meta: 'Meta' };
const STATE_ICON: Record<CellState, string> = { ok: '✓', attention: '!', broken: '✕', verifying: '↻', not_set_up: '–', paused: '‖' };

function Cell({ cell, onOpen }: { cell: ConversionCell; onOpen: () => void }) {
  const s = CELL_STATE[cell.state];
  const detailed = useDetailed();
  if (cell.state === 'not_set_up') return <td className="px-4 py-3 text-xs text-slate-400">Not tracked here</td>;
  const color = cell.state === 'broken' ? '#e11d48' : cell.state === 'attention' ? '#d97706' : cell.state === 'verifying' ? '#0284c7' : '#10b981';
  const noData = cell.daily.every((v) => v === 0);
  return (
    <td className="px-2 py-1.5">
      <button onClick={onOpen} className={clsx('group w-full rounded-lg border px-2.5 py-2 text-left transition hover:shadow-sm', cell.state === 'broken' ? 'border-rose-200 bg-rose-50/50 hover:border-rose-300' : cell.state === 'attention' ? 'border-amber-200 bg-amber-50/40 hover:border-amber-300' : cell.state === 'verifying' ? 'border-sky-200 bg-sky-50/40 hover:border-sky-300' : 'border-transparent hover:border-slate-200 hover:bg-slate-50')}>
        <div className="flex items-center justify-between gap-2">
          <span className={clsx('flex items-center gap-1.5 text-xs font-semibold', s.tone)}>
            <span className={clsx('flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-white', s.dot)}>{STATE_ICON[cell.state]}</span>
            {s.label}
          </span>
          {!noData && <Sparkline values={cell.daily.slice(-30)} color={color} width={64} height={20} />}
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {noData ? (
            'No daily data available'
          ) : (
            <>
              <span className="font-medium tabular-nums text-slate-800">{Math.round(cell.last7)}</span> last 7 days
              {cell.changePct != null && Math.abs(cell.changePct) >= 0.15 && <span className={clsx('ml-1 font-medium', cell.changePct < 0 ? 'text-rose-600' : 'text-emerald-600')}>{fmtPct(cell.changePct)}</span>}
            </>
          )}
        </div>
        {detailed && <div className="mt-0.5 truncate font-mono text-[10px] text-slate-400">{cell.entities.map((e) => e.name).join(' + ')}</div>}
      </button>
    </td>
  );
}

function StatusBanner({ problems }: { problems: Problem[] }) {
  const active = problems.filter((p) => isActiveProblem(p) && !p.fyi);
  const counts = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, active.filter((p) => p.severity === s).length])) as Record<Severity, number>;
  const status = overallSentence(counts);
  const scans = useStore((s) => s.scans);
  const issues = useStore((s) => s.issues);
  const detailed = useDetailed();
  const role = useRole();
  const lowRisk = active.filter((p) => p.fix && p.fix.status !== 'applied' && p.fix.risk === 'low').length;
  const review = problems.filter((p) => p.status === 'review_requested').length;
  const score = healthScore(issues);
  const Icon = status.tone === 'good' ? CheckCircle2 : AlertTriangle;
  return (
    <div className={clsx('flex flex-wrap items-center gap-4 rounded-xl border p-5', status.tone === 'bad' ? 'border-rose-200 bg-rose-50' : status.tone === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50')}>
      <Icon size={28} className={clsx('shrink-0', status.tone === 'bad' ? 'text-rose-600' : status.tone === 'warn' ? 'text-amber-600' : 'text-emerald-600')} />
      <div className="min-w-0 flex-1">
        <div className="text-lg font-semibold text-slate-900">{status.text}</div>
        <div className="mt-0.5 text-sm text-slate-600">
          {active.length} open problem{active.length === 1 ? '' : 's'}
          {role === 'client' && lowRisk > 0 && <> · {lowRisk} you can fix yourself in a click</>}
          {role === 'consultant' && review > 0 && (
            <>
              {' '}
              · <Link to="/problems?view=review" className="font-medium text-violet-700 hover:underline">{review} waiting for your review</Link>
            </>
          )}{' '}
          · checked {scans[0] ? fmtDateTime(scans[0].startedAt) : '—'}
        </div>
      </div>
      {detailed && (
        <div className="text-right" title="100 minus weighted open issues (critical 8, high 5, medium 2, low 1)">
          <div className={clsx('text-3xl font-semibold tabular-nums', scoreColor(score))}>{score}</div>
          <div className="text-[11px] text-slate-500">health score</div>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => useUi.getState().setAssistantOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-sm font-medium text-violet-700 shadow-sm hover:bg-violet-50">
          <Sparkles size={14} /> What should I do first?
        </button>
        <Link to="/problems" className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800">
          See problems <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

function ConversionGrid({ rows, onOpen }: { rows: ConversionRow[]; onOpen: (conversion: string, platform?: Platform) => void }) {
  const detailed = useDetailed();
  return (
    <Card
      title={
        <span>
          Are your conversions being tracked?
          <span className="ml-2 text-xs font-normal text-slate-500">Each business conversion, on each platform. Click a cell for the details.</span>
        </span>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[22%]" />
            <col />
            <col />
            <col />
            <col className="w-10" />
          </colgroup>
          <thead className="text-left text-xs text-slate-500">
            <tr className="border-b border-slate-100">
              <th className="px-4 py-2 font-medium">Conversion</th>
              {PLATFORMS.map((p) => (
                <th key={p} className="px-4 py-2 font-medium">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm" style={{ background: TOOLS[p].color }} />
                    {PLATFORM_LABEL[p]}
                  </span>
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.conversion.id} className="group">
                <td className="px-4 py-2 align-middle">
                  <button onClick={() => onOpen(r.conversion.id)} className="text-left">
                    <div className="font-medium text-slate-900 hover:underline">{r.conversion.label}</div>
                    <div className="text-xs text-slate-500">{detailed && r.conversion.datalayerEvent ? <span className="font-mono">dataLayer: {r.conversion.datalayerEvent}</span> : r.conversion.description}</div>
                  </button>
                </td>
                {PLATFORMS.map((p) => (
                  <Cell key={p} cell={r.cells[p]} onOpen={() => onOpen(r.conversion.id, p)} />
                ))}
                <td className="pr-2 text-right">
                  <AddToChat item={{ kind: 'conversion', id: r.conversion.id }} className="opacity-0 group-hover:opacity-100 focus:opacity-100" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ConversionDrawer({ row, platform }: { row: ConversionRow; platform?: Platform }) {
  const platforms = platform ? [platform] : PLATFORMS.filter((p) => row.cells[p].state !== 'not_set_up');
  return (
    <div className="space-y-6 p-6">
      <div className="pr-8">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Conversion</div>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">
          {row.conversion.label}
          {platform && <span className="font-normal text-slate-500"> → {PLATFORM_LABEL[platform]}</span>}
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">{row.conversion.description}</p>
        <div className="mt-3">
          <AddToChat item={{ kind: 'conversion', id: row.conversion.id, platform }} variant="button" />
        </div>
      </div>
      {platforms.map((p) => (
        <PlatformSection key={p} cell={row.cells[p]} showTitle={!platform} />
      ))}
    </div>
  );
}

function PlatformSection({ cell, showTitle }: { cell: ConversionCell; showTitle: boolean }) {
  const s = CELL_STATE[cell.state];
  const main = cell.entities[0];
  const series: Series[] = [{ key: 'v', label: `${PLATFORM_LABEL[cell.platform]} reported`, values: cell.daily, color: TOOLS[cell.platform].color }];
  return (
    <section className="space-y-4">
      {showTitle && (
        <div className="flex items-center gap-2 border-b border-slate-100 pb-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: TOOLS[cell.platform].color }} />
          <span className="font-semibold text-slate-900">{PLATFORM_LABEL[cell.platform]}</span>
        </div>
      )}
      <div className="flex items-center gap-2 text-sm">
        <span className={clsx('h-2.5 w-2.5 rounded-full', s.dot)} />
        <span className={clsx('font-semibold', s.tone)}>{s.label}</span>
        {cell.changePct != null && (
          <span className="text-slate-500">
            · {Math.round(cell.last7)} in the last 7 days vs {Math.round(cell.baseline7)} in a typical week ({fmtPct(cell.changePct)})
          </span>
        )}
      </div>
      {cell.daily.some((v) => v > 0) && main && <MetricChart series={series} height={170} selectFor={main.id} />}
      {cell.problems.length > 0 && (
        <div>
          <SectionTitle>What's wrong</SectionTitle>
          <div className="space-y-1.5">
            {cell.problems.map((p) => (
              <ProblemLink key={p.id} p={p} />
            ))}
          </div>
        </div>
      )}
      {main && (
        <div>
          <SectionTitle>How the data gets there</SectionTitle>
          <Journey entityId={main.id} />
        </div>
      )}
      <Technical summary={cell.entities.map((e) => e.name).join(', ')}>
        <div>
          <SectionTitle>Tracked as</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {cell.entities.map((e) => (
              <span key={e.id} className="inline-flex items-center gap-0.5">
                <EntityChip entity={e} showKind />
                <AddToChat item={{ kind: 'entity', id: e.id }} />
              </span>
            ))}
          </div>
          {cell.entities.length > 1 && <p className="mt-1.5 text-xs text-amber-700">More than one conversion action counts this — the totals above add them together, as Google Ads does.</p>}
        </div>
        {main && <LineageSections entityId={main.id} />}
      </Technical>
    </section>
  );
}

function TopProblems({ problems }: { problems: Problem[] }) {
  const role = useRole();
  const top = problems.filter((p) => isActiveProblem(p) && !p.fyi && p.source === 'issue').slice(0, 4);
  return (
    <Card title="Fix these first" actions={<Link to="/problems" className="text-xs font-medium text-indigo-600 hover:underline">All problems</Link>}>
      <ul className="divide-y divide-slate-100">
        {top.map((p) => {
          const self = p.fix && p.fix.status !== 'applied' && (role === 'consultant' || p.fix.risk === 'low');
          return (
            <li key={p.id} className="group flex items-start gap-3 px-4 py-3">
              <PlainSeverity severity={p.severity} />
              <Link to={problemPath(p.id)} className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-900 group-hover:underline">{p.headline}</div>
                <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{p.impact}</div>
              </Link>
              <div className="flex shrink-0 items-center gap-1">
                <AddToChat item={{ kind: 'problem', id: p.id }} className="opacity-0 group-hover:opacity-100" />
                <Link
                  to={problemPath(p.id) + '#fix'}
                  className={clsx('whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium', self ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'border border-slate-200 text-slate-700 hover:bg-slate-50')}
                >
                  {self ? (role === 'client' ? 'Fix it' : 'Review fix') : role === 'client' ? 'Get help' : 'View'}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function HeadsUp({ problems }: { problems: Problem[] }) {
  const items = problems.filter((p) => p.source === 'anomaly' && isActiveProblem(p));
  const changes = useStore((s) => s.changeEvents);
  const recent = [...changes].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4);
  return (
    <div className="space-y-5">
      {items.length > 0 && (
        <Card title="Unusual activity">
          <ul className="divide-y divide-slate-100">
            {items.map((p) => (
              <li key={p.id}>
                <Link to={problemPath(p.id)} className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-slate-50">
                  {p.fyi ? <Info size={15} className="mt-0.5 shrink-0 text-sky-500" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-slate-800">{p.headline}</span>
                    <span className="text-xs text-slate-500">{p.fyi ? 'Expected — explained by a budget change' : 'Worth checking'}</span>
                  </span>
                  <ChevronRight size={14} className="mt-1 text-slate-300" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title="Recent changes" actions={<Link to="/scans" className="text-xs font-medium text-indigo-600 hover:underline">History</Link>}>
        <ul className="divide-y divide-slate-100">
          {recent.map((c) => (
            <li key={c.id} className="group flex items-start gap-2 px-4 py-2.5">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-sm" style={{ background: TOOLS[c.tool].color }} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-slate-800">{c.summary}</span>
                <span className="text-xs text-slate-500">
                  {TOOLS[c.tool].short} · {fmtDateTime(c.at)} · {c.actor}
                </span>
              </span>
              <AddToChat item={{ kind: 'change', id: c.id }} className="opacity-0 group-hover:opacity-100" />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function Overview() {
  const problems = useProblems();
  const rows = useConversionGrid();
  const [params, setParams] = useSearchParams();
  const conv = params.get('conversion');
  const platform = (params.get('platform') as Platform) ?? undefined;
  const open = rows.find((r) => r.conversion.id === conv);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Tracking overview</h1>
        <p className="mt-0.5 text-sm text-slate-500">BrightPath Solar · Google Tag Manager, GA4, Google Ads and Meta</p>
      </div>
      <StatusBanner problems={problems} />
      <ConversionGrid rows={rows} onOpen={(c, p) => setParams(p ? { conversion: c, platform: p } : { conversion: c })} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <TopProblems problems={problems} />
        <HeadsUp problems={problems} />
      </div>
      <Drawer open={!!open} onClose={() => setParams({})}>
        {open && <ConversionDrawer row={open} platform={platform} />}
      </Drawer>
    </div>
  );
}
