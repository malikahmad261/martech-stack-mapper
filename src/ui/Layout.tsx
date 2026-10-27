import clsx from 'clsx';
import { AlertTriangle, ChevronDown, Database, GitBranch, Home, Menu, Network, RefreshCw, RotateCcw, Search, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useStore } from '../store';
import { useChat } from '../store/chat';
import { PEOPLE, ROLE_DEFAULT_DETAIL, detailOf, useUi, type Role } from '../store/ui';
import { AssistantPanel } from './assistant/AssistantPanel';
import { CommandPalette } from './components/CommandPalette';
import { Button, HealthDot, Modal } from './components/common';
import { toolHealth } from './derive';
import { useActiveProblems } from './hooks';
import { TOOLS, TOOL_ORDER, fmtDateTime, toolPath } from './meta';

function NavItem({ to, icon, children, count, end, urgent }: { to: string; icon?: ReactNode; children: ReactNode; count?: number; end?: boolean; urgent?: boolean }) {
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
      {count !== undefined && count > 0 && <span className={clsx('rounded-full px-1.5 text-xs font-medium', urgent ? 'bg-rose-100 text-rose-700' : 'bg-slate-200/70 text-slate-600')}>{count}</span>}
    </NavLink>
  );
}

function Sidebar({ onNavigate, onReset }: { onNavigate?: () => void; onReset: () => void }) {
  const entities = useStore((s) => s.entities);
  const problems = useActiveProblems();
  const urgent = problems.some((p) => p.severity === 'critical');
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
        <NavItem to="/" end icon={<Home size={16} />}>
          Overview
        </NavItem>
        <NavItem to="/problems" icon={<AlertTriangle size={16} />} count={problems.length} urgent={urgent}>
          Problems
        </NavItem>
      </div>
      <div>
        <div className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Explore the stack</div>
        <div className="space-y-0.5">
          <NavItem to="/map" icon={<Network size={16} />}>
            Stack map
          </NavItem>
          <NavItem to="/relationships" icon={<GitBranch size={16} />}>
            Relationships
          </NavItem>
        </div>
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
      <div className="space-y-0.5">
        <NavItem to="/scans" icon={<Database size={16} />}>
          Scans & history
        </NavItem>
      </div>
      <div className="mt-auto space-y-2 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
        <div>
          <strong>Prototype.</strong> All data is fictional and no changes are sent to any platform.
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onReset();
          }}
          className="flex items-center gap-1 font-medium text-amber-900 hover:underline"
        >
          <RotateCcw size={11} /> Reset demo
        </button>
      </div>
    </nav>
  );
}

function DetailToggle() {
  const ui = useUi();
  const detail = detailOf(ui);
  return (
    <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium" role="group" aria-label="Level of detail">
      {(['simple', 'detailed'] as const).map((d) => (
        <button
          key={d}
          onClick={() => ui.setDetail(d)}
          title={d === 'simple' ? 'Plain language; technical details collapsed' : 'IDs, rule codes, raw config and lineage shown by default'}
          className={clsx('rounded-md px-2.5 py-1 capitalize transition', detail === d ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}
        >
          {d}
        </button>
      ))}
    </div>
  );
}

const ROLE_INFO: Record<Role, string> = {
  client: 'Monitor health, apply low-risk fixes, request reviews',
  consultant: 'Full technical detail, approve and apply any fix',
};

function RoleMenu() {
  const role = useUi((s) => s.role);
  const setRole = useUi((s) => s.setRole);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const p = PEOPLE[role];
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-100" title="Demo: switch between the client and consultant experience">
        <span className={clsx('flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white', role === 'client' ? 'bg-emerald-600' : 'bg-indigo-600')}>{p.initials}</span>
        <span className="hidden text-left leading-tight xl:block">
          <span className="block text-xs font-medium text-slate-800">{p.name}</span>
          <span className="block text-[11px] text-slate-500">{role === 'client' ? 'Client' : 'Consultant'}</span>
        </span>
        <ChevronDown size={14} className="text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          <div className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Demo: view as</div>
          {(['client', 'consultant'] as const).map((r) => (
            <button
              key={r}
              onClick={() => {
                setRole(r);
                setOpen(false);
              }}
              className={clsx('flex w-full items-start gap-2.5 rounded-lg p-2 text-left hover:bg-slate-50', r === role && 'bg-indigo-50/60')}
            >
              <span className={clsx('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white', r === 'client' ? 'bg-emerald-600' : 'bg-indigo-600')}>{PEOPLE[r].initials}</span>
              <span>
                <span className="block text-sm font-medium text-slate-900">
                  {PEOPLE[r].name} · {r === 'client' ? 'Client' : 'Consultant'}
                </span>
                <span className="block text-xs text-slate-500">{PEOPLE[r].title}, {PEOPLE[r].org}</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {ROLE_INFO[r]}. Starts in {ROLE_DEFAULT_DETAIL[r]} view.
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
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
  const ui = useUi();
  const contextCount = useChat((s) => s.context.length);
  const [scanOpen, setScanOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setNavOpen(false), [location.pathname]);
  // Master–detail pages use the full width and height below the header.
  const fullBleed = location.pathname.startsWith('/problems');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'k') {
        e.preventDefault();
        useUi.getState().setPaletteOpen(!useUi.getState().paletteOpen);
      } else if (k === 'i') {
        e.preventDefault();
        useUi.getState().setAssistantOpen(!useUi.getState().assistantOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    // --assistant-w lets drawers and floating bars stop at the assistant's edge, so you can keep chatting.
    <div className="flex min-h-screen" style={{ ['--assistant-w' as string]: ui.assistantOpen ? '420px' : '0px' }}>
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 border-r border-slate-200 bg-white lg:block">
        <Sidebar onReset={() => setResetOpen(true)} />
      </aside>
      {navOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setNavOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <button className="absolute right-2 top-3 p-1 text-slate-400" onClick={() => setNavOpen(false)} aria-label="Close menu">
              <X size={18} />
            </button>
            <Sidebar onReset={() => setResetOpen(true)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-[var(--header-h)] items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur">
          <button className="rounded-md p-1 text-slate-500 lg:hidden" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <button
            onClick={() => ui.setPaletteOpen(true)}
            className="flex w-full max-w-xs items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-400 hover:border-slate-300 hover:bg-white"
          >
            <Search size={14} />
            <span className="flex-1 text-left">Search or jump to…</span>
            <kbd className="rounded border border-slate-200 bg-white px-1.5 text-[10px] font-medium text-slate-500">⌘K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-3">
            <div className={clsx('hidden items-center gap-1.5 whitespace-nowrap text-xs text-slate-500', !ui.assistantOpen && '2xl:flex')}>
              Last scan <span className="font-medium text-slate-700">{scans[0] ? fmtDateTime(scans[0].startedAt) : '—'}</span>
            </div>
            <Button variant="ghost" size="sm" className="whitespace-nowrap" onClick={() => setScanOpen(true)} title={`Last scan ${scans[0] ? fmtDateTime(scans[0].startedAt) : '—'} · daily at 06:00 UTC`}>
              <RefreshCw size={13} />
              Re-scan
            </Button>
            <DetailToggle />
            <RoleMenu />
            <button
              onClick={() => ui.setAssistantOpen(!ui.assistantOpen)}
              title="Assistant (⌘I)"
              className={clsx(
                'relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium shadow-sm transition',
                ui.assistantOpen ? 'bg-violet-100 text-violet-800' : 'bg-violet-600 text-white hover:bg-violet-700',
              )}
            >
              <Sparkles size={14} />
              Assistant
              {contextCount > 0 && !ui.assistantOpen && <span className="absolute -right-1.5 -top-1.5 rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold text-white">{contextCount}</span>}
            </button>
          </div>
        </header>
        <main className={fullBleed ? 'w-full flex-1' : 'mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6'}>
          <Outlet />
        </main>
      </div>
      <AssistantPanel />
      <CommandPalette onRescan={() => setScanOpen(true)} />
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
                useChat.getState().newChat();
                setResetOpen(false);
              }}
            >
              Reset
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">This restores the original dummy dataset and discards your edits, approvals, applied fixes, scans and assistant chat.</p>
      </Modal>
    </div>
  );
}
