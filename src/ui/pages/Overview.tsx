import clsx from 'clsx';
import { AlertTriangle, ArrowRight, ChevronRight, Info, Sparkles } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { CELL_STATE, PLATFORMS, type CellState, type ConversionCell, type ConversionRow, type Platform } from '../../insights/conversions';
import { SEVERITY_PLAIN, overallSentence } from '../../insights/plain';
import { isActiveProblem, SEVERITY_ORDER, type Problem } from '../../insights/problems';
import type { Severity } from '../../model/schema';
import { useStore } from '../../store';
import { PEOPLE, useRole, useUi } from '../../store/ui';
import { AddToChat } from '../components/AddToChat';
import { MetricChart, type Series } from '../components/Charts';
import { Card, Drawer, EntityChip, HealthRing, PlainSeverity, SEVERITY_DOT, SectionTitle, Sparkline, Technical, ToolSquare } from '../components/common';
import { Journey } from '../components/Journey';
import { LineageSections } from '../components/Lineage';
import { healthScore } from '../derive';
import { problemPath, useConversionGrid, useProblems } from '../hooks';
import { TOOLS, fmtDateTime, fmtPct } from '../meta';
import { ProblemLink } from './Problems';

const PLATFORM_LABEL: Record<Platform, string> = { ga4: 'Google Analytics 4', google_ads: 'Google Ads', meta: 'Meta' };
const STATE_ICON: Record<CellState, string> = { ok: '✓', attention: '!', broken: '✕', verifying: '↻', not_set_up: '–', paused: '‖' };

// How each cell state looks. Broken cells glow so problems are seen before they are read.
const CELL_LOOK: Record<CellState, { cell: string; icon: string; line: string }> = {
  ok: { cell: 'border-transparent hover:border-slate-200 hover:bg-white/60', icon: 'bg-emerald-500', line: '#10b981' },
  attention: { cell: 'border-amber-300/50 bg-amber-400/[.12] hover:border-amber-300', icon: 'bg-amber-500', line: '#d97706' },
  broken: {
    cell: 'border-rose-300/60 bg-rose-500/[.07] shadow-[0_8px_26px_-14px_rgba(244,63,94,.5),inset_0_0_18px_-10px_rgba(244,63,94,.45)] hover:border-rose-300',
    icon: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,.5)]',
    line: '#e11d48',
  },
  verifying: { cell: 'border-sky-300/60 bg-sky-500/[.08] hover:border-sky-300', icon: 'bg-sky-500', line: '#0284c7' },
  paused: { cell: 'border-transparent hover:border-slate-200 hover:bg-white/60', icon: 'bg-slate-300', line: '#94a3b8' },
  not_set_up: { cell: '', icon: 'bg-slate-300', line: '#94a3b8' },
};

function Cell({ cell, onOpen }: { cell: ConversionCell; onOpen: () => void }) {
  const s = CELL_STATE[cell.state];
  if (cell.state === 'not_set_up') return <td className="px-4 py-3 text-xs text-slate-400">Not tracked here</td>;
  const look = CELL_LOOK[cell.state];
  const noData = cell.daily.every((v) => v === 0);
  return (
    <td className="px-1.5 py-1.5">
      <button onClick={onOpen} className={clsx('group grid w-full gap-0.5 rounded-[13px] border px-3 py-2 text-left transition-colors', look.cell)}>
        <span className="flex items-center justify-between gap-2">
          <span className={clsx('flex items-center gap-1.5 text-xs font-semibold', s.tone)}>
            <span className={clsx('flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-white', look.icon)}>{STATE_ICON[cell.state]}</span>
            {s.label}
          </span>
          {!noData && <Sparkline values={cell.daily.slice(-30)} color={look.line} width={64} height={20} />}
        </span>
        <span className="text-xs text-slate-500">
          {noData ? (
            'No daily data available'
          ) : cell.state === 'verifying' ? (
            <>
              <span className="font-semibold tabular-nums text-slate-800">{Math.round(cell.last7)}</span> last 7 days · recovering
            </>
          ) : (
            <>
              <span className="font-semibold tabular-nums text-slate-800">{Math.round(cell.last7)}</span> last 7 days
              {cell.changePct != null && Math.abs(cell.changePct) >= 0.15 && <span className={clsx('ml-1 font-semibold', cell.changePct < 0 ? 'text-rose-600' : 'text-emerald-600')}>{fmtPct(cell.changePct)}</span>}
            </>
          )}
        </span>
        <span className="truncate font-mono text-[10.5px] text-slate-400">{cell.entities.map((e) => e.name).join(' + ')}</span>
      </button>
    </td>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const STATUS_DOT = {
  bad: 'bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,.12),0_0_12px_rgba(244,63,94,.45)]',
  warn: 'bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,.14)]',
  good: 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,.14)]',
};

/** The opening card: the health score, one sentence on how things stand, and where to go next. */
function Hero({ problems }: { problems: Problem[] }) {
  const active = problems.filter((p) => isActiveProblem(p) && !p.fyi);
  const counts = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, active.filter((p) => p.severity === s).length])) as Record<Severity, number>;
  const status = overallSentence(counts);
  const scans = useStore((s) => s.scans);
  const issues = useStore((s) => s.issues);
  const role = useRole();
  const lowRisk = active.filter((p) => p.fix && p.fix.status !== 'applied' && p.fix.risk === 'low').length;
  const review = problems.filter((p) => p.status === 'review_requested').length;
  return (
    <section className="surface relative overflow-hidden rounded-2xl">
      {status.tone !== 'good' && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(640px 240px at 0% 0%, ${status.tone === 'bad' ? 'rgba(225,40,80,.09)' : 'rgba(234,160,20,.1)'}, transparent 70%)` }}
        />
      )}
      <div className="relative grid items-center gap-7 p-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:px-7">
        <HealthRing score={healthScore(issues)} />
        <div className="grid min-w-0 gap-3">
          <div className="flex items-center gap-3">
            <span className={clsx('h-3 w-3 shrink-0 rounded-full', STATUS_DOT[status.tone])} />
            <h2 className="text-balance font-display text-[21px] font-semibold leading-snug tracking-tight text-slate-900">{status.text}</h2>
          </div>
          <p className="text-sm text-slate-600">
            {active.length} open problem{active.length === 1 ? '' : 's'}
            {role === 'client' && lowRisk > 0 && <> · {lowRisk} you can fix yourself in a click</>}
            {role === 'consultant' && review > 0 && (
              <>
                {' '}
                · <Link to="/problems?view=review" className="font-medium text-violet-700 hover:underline">{review} waiting for your review</Link>
              </>
            )}{' '}
            · checked {scans[0] ? fmtDateTime(scans[0].startedAt) : '—'}
          </p>
          <div className="flex flex-wrap gap-2">
            {SEVERITY_ORDER.map((s) => (
              <Link key={s} to="/problems" className="surface-2 inline-flex h-[30px] items-center gap-2 rounded-full px-3 text-[12.5px] text-slate-600 transition-colors hover:bg-white/70" title={SEVERITY_PLAIN[s].hint}>
                <span className={clsx('h-2 w-2 rounded-full', SEVERITY_DOT[s])} />
                {SEVERITY_PLAIN[s].label}
                <span className="font-semibold tabular-nums text-slate-900">{counts[s]}</span>
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => useUi.getState().setAssistantOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-[11px] border border-slate-200 bg-white/70 px-3.5 text-sm font-medium text-indigo-700 shadow-[inset_0_1px_0_#fff] transition-colors hover:bg-white"
            >
              <Sparkles size={14} /> What should I do first?
            </button>
            <Link to="/problems" className="inline-flex h-9 items-center gap-1.5 rounded-[11px] bg-slate-900 px-3.5 text-sm font-medium text-white shadow-[0_8px_18px_-10px_rgb(var(--slate-900))] transition-colors hover:bg-slate-800">
              See problems <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function ConversionGrid({ rows, onOpen }: { rows: ConversionRow[]; onOpen: (conversion: string, platform?: Platform) => void }) {
  return (
    <Card title="Are your conversions being tracked?" subtitle="Each business conversion, on each platform. Click a cell to see how the data gets there.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed text-sm">
          <colgroup>
            <col className="w-[22%]" />
            <col />
            <col />
            <col />
            <col className="w-10" />
          </colgroup>
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="px-5 pb-2 pt-3 font-medium">Conversion</th>
              {PLATFORMS.map((p) => (
                <th key={p} className="px-3 pb-2 pt-3 font-medium">
                  <span className="flex items-center gap-1.5">
                    <ToolSquare tool={p} className="!h-2 !w-2" />
                    {PLATFORM_LABEL[p]}
                  </span>
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.conversion.id} className="group border-t border-slate-900/[.06]">
                <td className="px-5 py-2 align-middle">
                  <button onClick={() => onOpen(r.conversion.id)} className="block w-full min-w-0 text-left">
                    <div className="font-semibold text-slate-900 hover:underline">{r.conversion.label}</div>
                    <div className="text-xs leading-snug text-slate-500">{r.conversion.description}</div>
                    {r.conversion.datalayerEvent && <div className="mt-0.5 truncate font-mono text-[10.5px] text-slate-400">dataLayer: {r.conversion.datalayerEvent}</div>}
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
    <div className="space-y-6 p-6 sm:p-7">
      <div className="pr-8">
        <div className="text-xs text-slate-500">Conversion</div>
        <h2 className="mt-1 text-balance font-display text-[22px] font-semibold leading-tight tracking-tight text-slate-900">
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
        <div className="flex items-center gap-2 border-b border-slate-900/[.06] pb-1.5">
          <ToolSquare tool={cell.platform} />
          <span className="font-display font-semibold tracking-tight text-slate-900">{PLATFORM_LABEL[cell.platform]}</span>
        </div>
      )}
      <div className={clsx('flex flex-wrap items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm', CELL_LOOK[cell.state].cell || 'border-slate-200 bg-white/50', '!shadow-none')}>
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
      <ul className="divide-y divide-slate-900/[.06]">
        {top.map((p) => {
          const self = p.fix && p.fix.status !== 'applied' && (role === 'consultant' || p.fix.risk === 'low');
          return (
            <li key={p.id} className="group flex items-start gap-3 px-5 py-3.5">
              <PlainSeverity severity={p.severity} />
              <Link to={problemPath(p.id)} className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900 group-hover:underline">{p.headline}</div>
                <div className="mt-0.5 line-clamp-2 text-xs text-slate-600">{p.impact}</div>
                {p.ruleId && <div className="mt-1 truncate font-mono text-[10.5px] text-slate-400">{p.ruleId} · {p.technicalTitle}</div>}
              </Link>
              <div className="flex shrink-0 items-center gap-1">
                <AddToChat item={{ kind: 'problem', id: p.id }} className="opacity-0 group-hover:opacity-100" />
                <Link
                  to={problemPath(p.id) + '#fix'}
                  className={clsx(
                    'whitespace-nowrap rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-colors',
                    self ? 'bg-emerald-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.25),0_6px_14px_-8px_rgba(5,150,105,.7)] hover:bg-emerald-700' : 'border border-slate-200 bg-white/70 text-slate-700 hover:bg-white',
                  )}
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
          <ul className="divide-y divide-slate-900/[.06]">
            {items.map((p) => (
              <li key={p.id}>
                <Link to={problemPath(p.id)} className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-white/50">
                  <span className={clsx('grid h-7 w-7 shrink-0 place-items-center rounded-[9px]', p.fyi ? 'bg-sky-500/10 text-sky-600' : 'bg-amber-400/15 text-amber-600')}>
                    {p.fyi ? <Info size={15} /> : <AlertTriangle size={15} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800">{p.headline}</span>
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
        <ul className="divide-y divide-slate-900/[.06]">
          {recent.map((c) => (
            <li key={c.id} className="group flex items-start gap-2.5 px-5 py-3">
              <ToolSquare tool={c.tool} className="mt-1.5 !h-2 !w-2" />
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
  const role = useRole();
  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs text-slate-500">BrightPath Solar · Google Tag Manager, GA4, Google Ads and Meta</div>
        <h1 className="mt-1 text-balance font-display text-[30px] font-semibold leading-tight tracking-tight text-slate-900">
          {greeting()}, {PEOPLE[role].name}
        </h1>
      </div>
      <Hero problems={problems} />
      <ConversionGrid rows={rows} onOpen={(c, p) => setParams(p ? { conversion: c, platform: p } : { conversion: c })} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] [&>*]:min-w-0">
        <TopProblems problems={problems} />
        <HeadsUp problems={problems} />
      </div>
      <Drawer open={!!open} onClose={() => setParams({})}>
        {open && <ConversionDrawer row={open} platform={platform} />}
      </Drawer>
    </div>
  );
}
