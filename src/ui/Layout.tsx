import clsx from 'clsx';
import { Activity, AlertTriangle, Database, GitBranch, LayoutGrid, Menu, RefreshCw, RotateCcw, Wrench, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useStore } from '../store';
import { Button, HealthDot, Modal } from './components/common';
import { scoreColor, toolHealth, useCounts } from './derive';
import { TOOLS, TOOL_ORDER, fmtDateTime, toolPath } from './meta';

function NavItem({ to, icon, children, count, end }: { to: string; icon?: ReactNode; children: ReactNode; count?: number; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx('flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition', isActive ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')
      }
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {count !== undefined && count > 0 && <span className="rounded-full bg-slate-200/70 px-1.5 text-xs font-medium text-slate-600">{count}</span>}
    </NavLink>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const entities = useStore((s) => s.entities);
  const counts = useCounts();
  return (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-4" onClick={onNavigate}>
      <div className="flex items-center gap-2 px-2">
        <img src="/favicon.svg" alt="" className="h-7 w-7" />
        <div className="leading-tight">
          <div className="text-sm font-semibold text-slate-900">Stack Mapper</div>
          <div className="text-xs text-slate-500">BrightPath Solar</div>
        </div>
      </div>
      <div className="space-y-0.5">
        <NavItem to="/" end icon={<LayoutGrid size={16} />}>
          Stack map
        </NavItem>
        <NavItem to="/relationships" icon={<GitBranch size={16} />}>
          Relationships
        </NavItem>
      </div>
      <div>
        <div className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Tools</div>
        <div className="space-y-0.5">
          {TOOL_ORDER.map((t) => (
            <NavItem key={t} to={toolPath(t)} icon={<span className="h-2.5 w-2.5 rounded-sm" style={{ background: TOOLS[t].color }} />}>
              <span className="flex items-center justify-between gap-2">
                {TOOLS[t].label}
                <HealthDot health={toolHealth(t, entities)} />
              </span>
            </NavItem>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Findings</div>
        <div className="space-y-0.5">
          <NavItem to="/issues" icon={<AlertTriangle size={16} />} count={counts.issues}>
            Integration issues
          </NavItem>
          <NavItem to="/anomalies" icon={<Activity size={16} />} count={counts.anomalies}>
            Data anomalies
          </NavItem>
          <NavItem to="/fixes" icon={<Wrench size={16} />} count={counts.fixes}>
            Fix queue
          </NavItem>
        </div>
      </div>
      <div className="space-y-0.5">
        <NavItem to="/scans" icon={<Database size={16} />}>
          Scans & sources
        </NavItem>
      </div>
      <div className="mt-auto rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
        <strong>Prototype.</strong> All data is fictional and no changes are sent to any platform.
      </div>
    </nav>
  );
}

const SCAN_STEPS = [
  'Fetching GTM Web container (GTM-BPW7K2Q)',
  'Fetching GTM Server container (GTM-BPS4N9R)',
  'Fetching GA4 property 412345678',
  'Fetching Google Ads account 123-456-7890',
  'Fetching Meta ad account and dataset',
  'Building relationship graph',
  'Running 23 integration checks',
  'Detecting data anomalies',
];

function RescanModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const rescan = useStore((s) => s.rescan);
  const scans = useStore((s) => s.scans);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setDone(false);
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setStep(i);
      if (i >= SCAN_STEPS.length) {
        clearInterval(timer);
        rescan('on_demand');
        setDone(true);
      }
    }, 280);
    return () => clearInterval(timer);
  }, [open, rescan]);
  const latest = scans[0];
  return (
    <Modal open={open} onClose={() => done && onClose()} title={done ? 'Scan complete' : 'Scanning stack…'} footer={<Button variant="primary" disabled={!done} onClick={onClose}>Done</Button>}>
      <ul className="space-y-1.5 text-sm">
        {SCAN_STEPS.map((s, i) => (
          <li key={s} className={clsx('flex items-center gap-2', i < step ? 'text-slate-700' : i === step ? 'text-indigo-700' : 'text-slate-300')}>
            <span className={clsx('h-1.5 w-1.5 rounded-full', i < step ? 'bg-emerald-500' : i === step ? 'animate-pulse bg-indigo-500' : 'bg-slate-200')} />
            {s}
          </li>
        ))}
      </ul>
      {done && latest && (
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-lg bg-slate-50 p-2">
            <div className="text-lg font-semibold">{latest.summary.newIssues}</div>
            <div className="text-xs text-slate-500">new issues</div>
          </div>
          <div className="rounded-lg bg-emerald-50 p-2">
            <div className="text-lg font-semibold text-emerald-700">{latest.summary.resolvedIssues}</div>
            <div className="text-xs text-slate-500">resolved</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-2">
            <div className="text-lg font-semibold">{latest.summary.configChanges}</div>
            <div className="text-xs text-slate-500">config changes</div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function Layout() {
  const scans = useStore((s) => s.scans);
  const reset = useStore((s) => s.reset);
  const counts = useCounts();
  const [scanOpen, setScanOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setNavOpen(false), [location.pathname]);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-slate-200 bg-white lg:block">
        <Sidebar />
      </aside>
      {navOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setNavOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <button className="absolute right-2 top-3 p-1 text-slate-400" onClick={() => setNavOpen(false)} aria-label="Close menu">
              <X size={18} />
            </button>
            <Sidebar />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur">
          <button className="rounded-md p-1 text-slate-500 lg:hidden" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div className="hidden text-sm text-slate-500 sm:block">
            Last scan <span className="font-medium text-slate-700">{scans[0] ? fmtDateTime(scans[0].startedAt) : '—'}</span>
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs">Daily at 06:00 UTC</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-baseline gap-1 text-sm" title="Stack health score: 100 minus weighted open issues">
              <span className="text-slate-500">Health</span>
              <span className={clsx('text-lg font-semibold tabular-nums', scoreColor(counts.score))}>{counts.score}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setResetOpen(true)} title="Reset demo data">
              <RotateCcw size={14} />
              <span className="hidden sm:inline">Reset demo</span>
            </Button>
            <Button variant="primary" onClick={() => setScanOpen(true)}>
              <RefreshCw size={14} />
              Re-scan now
            </Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
      <RescanModal open={scanOpen} onClose={() => setScanOpen(false)} />
      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset the demo?"
        footer={
          <>
            <Button onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                reset();
                setResetOpen(false);
              }}
            >
              Reset
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">This restores the original dummy dataset and discards your edits, approvals, applied fixes and scans.</p>
      </Modal>
    </div>
  );
}
