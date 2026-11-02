import clsx from 'clsx';
import { AlertTriangle, ChevronDown, Database, GitBranch, Home, Menu, Network, RefreshCw, RotateCcw, Search, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useStore } from '../store';
import { useChat } from '../store/chat';
import { PEOPLE, useUi, type Role } from '../store/ui';
import { AssistantPanel } from './assistant/AssistantPanel';
import { CommandPalette } from './components/CommandPalette';
import { Button, HealthDot, Modal, ToolSquare } from './components/common';
import { toolHealth } from './derive';
import { useActiveProblems } from './hooks';
import { TOOLS, TOOL_ORDER, fmtDateTime, toolPath } from './meta';

/** The still colour field behind the app. It warms slightly towards rose while something urgent is open. */
function Backdrop() {
  const problems = useActiveProblems();
  const urgency = Math.min(1, problems.filter((p) => p.severity === 'critical').length * 0.22 + problems.filter((p) => p.severity === 'high').length * 0.04);
  const blob = 'absolute rounded-full';
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className={blob} style={{ width: '70vw', height: '70vw', left: '-18vw', top: '-30vw', opacity: 'var(--au-op)', background: 'radial-gradient(closest-side, var(--au-1), transparent)' }} />
      <div className={blob} style={{ width: '60vw', height: '60vw', right: '-20vw', top: '-10vw', opacity: 'var(--au-op)', background: 'radial-gradient(closest-side, var(--au-2), transparent)' }} />
      <div className={blob} style={{ width: '55vw', height: '55vw', left: '20vw', bottom: '-32vw', opacity: 'var(--au-op)', background: 'radial-gradient(closest-side, var(--au-3), transparent)' }} />
      <div className={blob} style={{ width: '40vw', height: '40vw', right: '5vw', bottom: '-12vw', opacity: 'var(--au-op)', background: 'radial-gradient(closest-side, var(--au-4), transparent)' }} />
      <div
        className={clsx(blob, 'transition-opacity duration-500')}
        style={{ width: '60vw', height: '50vw', left: '30vw', top: '-18vw', opacity: `calc(${urgency} * var(--au-op))`, background: 'radial-gradient(closest-side, var(--au-bad), transparent)' }}
      />
    </div>
  );
}

function NavItem({ to, icon, children, count, end, urgent }: { to: string; icon?: ReactNode; children: ReactNode; count?: number; end?: boolean; urgent?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx(
          'group flex items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] text-sm transition-colors',
          isActive
            ? 'bg-white/80 font-medium text-slate-900 shadow-[inset_0_1px_0_#fff,0_1px_2px_rgba(22,24,64,.05)] ring-1 ring-slate-900/[.06] [&_svg]:text-indigo-600'
            : 'text-slate-600 hover:bg-white/50 hover:text-slate-900',
        )
      }
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {count !== undefined && count > 0 && <span className={clsx('rounded-full px-1.5 text-xs font-semibold tabular-nums', urgent ? 'bg-rose-500/10 text-rose-600' : 'bg-slate-900/[.06] text-slate-600')}>{count}</span>}
    </NavLink>
  );
}

function NavLabel({ children }: { children: ReactNode }) {
  return <div className="mb-1 px-2.5 text-[10.5px] font-semibold uppercase tracking-[.08em] text-slate-400">{children}</div>;
}

function Sidebar({ onNavigate, onReset }: { onNavigate?: () => void; onReset: () => void }) {
  const entities = useStore((s) => s.entities);
  const problems = useActiveProblems();
  const urgent = problems.some((p) => p.severity === 'critical');
  return (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto px-3.5 py-4" onClick={onNavigate}>
      <div className="flex items-center gap-2.5 px-2">
        <span className="ai-gradient grid h-8 w-8 place-items-center rounded-[10px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_6px_16px_-8px_var(--ai-from)]">
          <Network size={16} />
        </span>
        <div className="leading-tight">
          <div className="font-display text-[15px] font-semibold tracking-tight text-slate-900">Stack Mapper</div>
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
        <NavLabel>Explore the stack</NavLabel>
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
        <NavLabel>Tools</NavLabel>
        <div className="space-y-0.5">
          {TOOL_ORDER.map((t) => (
            <NavItem key={t} to={toolPath(t)} icon={<ToolSquare tool={t} />}>
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
      <div className="surface-2 mt-auto space-y-2 rounded-2xl p-3 text-xs leading-relaxed text-slate-600">
        <div>
          <strong className="text-slate-900">Prototype.</strong> All data is fictional and no changes are sent to any platform.
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onReset();
          }}
          className="flex items-center gap-1 font-medium text-indigo-600 hover:underline"
        >
          <RotateCcw size={11} /> Reset demo
        </button>
      </div>
    </nav>
  );
}

const ROLE_INFO: Record<Role, string> = {
  client: 'Monitor health, apply low-risk fixes, request reviews',
  consultant: 'Approve and apply any fix, edit proposed changes',
};

function Avatar({ role, className }: { role: Role; className?: string }) {
  return (
    <span
      className={clsx(
        'flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white shadow-[0_0_0_2px_rgba(255,255,255,.8),0_0_0_3px_rgb(var(--slate-900)/.08)]',
        role === 'client' ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-indigo-500 to-violet-600',
        className,
      )}
    >
      {PEOPLE[role].initials}
    </span>
  );
}

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
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-[10px] px-1.5 py-1 transition-colors hover:bg-white/60" title="Demo: switch between the client and consultant experience">
        <Avatar role={role} />
        <span className="hidden text-left leading-tight xl:block">
          <span className="block text-xs font-medium text-slate-800">{p.name}</span>
          <span className="block text-[11px] text-slate-500">{role === 'client' ? 'Client' : 'Consultant'}</span>
        </span>
        <ChevronDown size={14} className="text-slate-400" />
      </button>
      {open && (
        <div className="glass-over absolute right-0 top-full z-40 mt-1.5 w-72 animate-pop-in rounded-2xl border border-white/70 p-1.5">
          <div className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Demo: view as</div>
          {(['client', 'consultant'] as const).map((r) => (
            <button
              key={r}
              onClick={() => {
                setRole(r);
                setOpen(false);
              }}
              className={clsx('flex w-full items-start gap-2.5 rounded-xl p-2 text-left transition-colors hover:bg-white/70', r === role && 'bg-white/80 ring-1 ring-slate-900/[.06]')}
            >
              <Avatar role={r} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium text-slate-900">
                  {PEOPLE[r].name} · {r === 'client' ? 'Client' : 'Consultant'}
                </span>
                <span className="block text-xs text-slate-500">
                  {PEOPLE[r].title}, {PEOPLE[r].org}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">{ROLE_INFO[r]}.</span>
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
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-slate-900/[.06]">
        <div className="ai-gradient h-full rounded-full transition-[width] duration-200 ease-out" style={{ width: `${(step / SCAN_STEPS.length) * 100}%` }} />
      </div>
      <ul className="space-y-1.5 text-sm">
        {SCAN_STEPS.map((s, i) => (
          <li key={s} className={clsx('flex items-center gap-2 transition-colors', i < step ? 'text-slate-700' : i === step ? 'font-medium text-indigo-700' : 'text-slate-400')}>
            <span className={clsx('h-1.5 w-1.5 rounded-full', i < step ? 'bg-emerald-500' : i === step ? 'bg-indigo-500' : 'bg-slate-300')} />
            {s}
          </li>
        ))}
      </ul>
      {done && latest && (
        <div className="mt-4 grid animate-fade-in grid-cols-3 gap-2 text-center text-sm">
          <div className="surface-2 rounded-xl p-2">
            <div className="font-display text-lg font-semibold">{latest.summary.newIssues}</div>
            <div className="text-xs text-slate-500">new issues</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-2">
            <div className="font-display text-lg font-semibold text-emerald-700">{latest.summary.resolvedIssues}</div>
            <div className="text-xs text-slate-500">resolved</div>
          </div>
          <div className="surface-2 rounded-xl p-2">
            <div className="font-display text-lg font-semibold">{latest.summary.configChanges}</div>
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
  // A short fade when moving between screens (not between problems in the same list).
  const screenKey = fullBleed ? '/problems' : location.pathname;
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
    <div className="relative flex min-h-screen" style={{ ['--assistant-w' as string]: ui.assistantOpen ? '420px' : '0px' }}>
      <Backdrop />
      <aside className="glass-chrome sticky top-0 z-20 hidden h-screen w-60 shrink-0 border-r border-slate-900/[.07] shadow-[inset_-1px_0_0_rgba(255,255,255,.7)] lg:block">
        <Sidebar onReset={() => setResetOpen(true)} />
      </aside>
      {navOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-slate-900/20" onClick={() => setNavOpen(false)} />
          <aside className="glass-over absolute inset-y-0 left-0 w-64 animate-rise-in">
            <button className="absolute right-2 top-3 rounded-lg p-1 text-slate-400 hover:bg-slate-900/[.05]" onClick={() => setNavOpen(false)} aria-label="Close menu">
              <X size={18} />
            </button>
            <Sidebar onReset={() => setResetOpen(true)} />
          </aside>
        </div>
      )}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="glass-chrome sticky top-0 z-30 flex h-[var(--header-h)] items-center gap-3 border-b border-slate-900/[.07] px-4 sm:px-5">
          <button className="rounded-lg p-1 text-slate-500 hover:bg-white/60 lg:hidden" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <button
            onClick={() => ui.setPaletteOpen(true)}
            className="surface-2 flex h-9 w-full max-w-xs items-center gap-2 rounded-[11px] px-2.5 text-sm text-slate-400 transition-colors hover:bg-white/70"
          >
            <Search size={15} />
            <span className="flex-1 text-left">Search or jump to…</span>
            <kbd className="rounded-md border border-slate-200 bg-white/70 px-1.5 font-mono text-[10px] font-medium text-slate-500">⌘K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <div className={clsx('hidden items-center gap-1.5 whitespace-nowrap text-xs text-slate-500', !ui.assistantOpen && '2xl:flex')}>
              Last scan <span className="font-medium text-slate-700">{scans[0] ? fmtDateTime(scans[0].startedAt) : '—'}</span>
            </div>
            <Button variant="ghost" size="sm" className="h-[34px] whitespace-nowrap !px-3 !text-sm" onClick={() => setScanOpen(true)} title={`Last scan ${scans[0] ? fmtDateTime(scans[0].startedAt) : '—'} · daily at 06:00 UTC`}>
              <RefreshCw size={14} />
              <span className="hidden sm:inline">Re-scan</span>
            </Button>
            <RoleMenu />
            <button
              onClick={() => ui.setAssistantOpen(!ui.assistantOpen)}
              title="Assistant (⌘I)"
              className={clsx(
                'relative inline-flex h-[34px] items-center gap-1.5 rounded-[11px] px-3.5 text-sm font-semibold transition-[filter,box-shadow]',
                ui.assistantOpen ? 'bg-violet-100 text-violet-800 ring-1 ring-violet-200' : 'ai-gradient text-white shadow-[inset_0_1px_0_rgba(255,255,255,.3),0_8px_20px_-10px_var(--ai-from)] hover:brightness-105',
              )}
            >
              <Sparkles size={14} />
              <span className="hidden sm:inline">Assistant</span>
              {contextCount > 0 && !ui.assistantOpen && <span className="absolute -right-1.5 -top-1.5 rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold text-white">{contextCount}</span>}
            </button>
          </div>
        </header>
        <main key={screenKey} className={clsx('animate-fade-in', fullBleed ? 'w-full flex-1' : 'mx-auto w-full max-w-[1400px] flex-1 px-4 py-7 sm:px-8')}>
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
