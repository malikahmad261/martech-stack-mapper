import clsx from 'clsx';
import { ChevronRight, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SEVERITY_PLAIN } from '../../insights/plain';
import type { ProblemStatus } from '../../insights/problems';
import type { Entity, Health, Severity, ToolId } from '../../model/schema';
import { useEntityMap } from '../../store';
import { HEALTH, KIND_LABEL, TOOLS, entityPath } from '../meta';

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', className)}>{children}</span>;
}

const DOT_GLOW: Partial<Record<Health, string>> = {
  healthy: 'shadow-[0_0_0_3px_rgba(16,185,129,.14)]',
  degraded: 'shadow-[0_0_0_3px_rgba(245,158,11,.16)]',
  broken: 'shadow-[0_0_0_3px_rgba(244,63,94,.14),0_0_8px_rgba(244,63,94,.45)]',
};

export function HealthDot({ health, className }: { health: Health; className?: string }) {
  return <span title={HEALTH[health].label} className={clsx('inline-block h-2 w-2 shrink-0 rounded-full', HEALTH[health].dot, DOT_GLOW[health], className)} />;
}

export function HealthBadge({ health }: { health: Health }) {
  return (
    <Badge className={HEALTH[health].badge}>
      <HealthDot health={health} className="!shadow-none" />
      {HEALTH[health].label}
    </Badge>
  );
}

export function ToolBadge({ tool, size = 'sm' }: { tool: ToolId; size?: 'sm' | 'xs' }) {
  const t = TOOLS[tool];
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-md font-medium', t.bg, t.text, size === 'xs' ? 'px-1 py-px text-[10px]' : 'px-1.5 py-0.5 text-xs')}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.color }} />
      {t.short}
    </span>
  );
}

/** A tool's colour as a small square, the way tools are identified throughout the app. */
export function ToolSquare({ tool, className }: { tool: ToolId; className?: string }) {
  return <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-[3px]', className)} style={{ background: TOOLS[tool].color }} />;
}

/** A clickable chip for any entity; navigates to that entity on its tool screen. */
export function EntityChip({ id, entity, highlight, showTool = true, showKind = false }: { id?: string; entity?: Entity; highlight?: boolean; showTool?: boolean; showKind?: boolean }) {
  const map = useEntityMap();
  const e = entity ?? (id ? map.get(id) : undefined);
  if (!e) return <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-400 line-through">{id?.split(':').pop()}</span>;
  const t = TOOLS[e.tool];
  return (
    <Link
      to={entityPath(e.tool, e.id)}
      title={`${t.label} · ${KIND_LABEL[e.kind]} · ${e.name}`}
      className={clsx(
        'inline-flex max-w-full items-center gap-1.5 rounded-lg border bg-white/80 px-2 py-1 text-xs font-medium text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,.9)] transition-colors hover:border-slate-300 hover:bg-white',
        highlight ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200',
      )}
    >
      <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: t.color }} />
      {showTool && <span className={clsx('shrink-0 text-[10px] font-semibold uppercase tracking-wide', t.text)}>{t.short}</span>}
      {showKind && <span className="shrink-0 text-[10px] text-slate-400">{KIND_LABEL[e.kind]}</span>}
      <span className="truncate">{e.name}</span>
      {e.health !== 'healthy' && e.health !== 'unknown' && <HealthDot health={e.health} />}
    </Link>
  );
}

export function Card({ className, children, title, actions, subtitle }: { className?: string; children: ReactNode; title?: ReactNode; actions?: ReactNode; subtitle?: ReactNode }) {
  return (
    <section className={clsx('surface rounded-2xl', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-slate-900/[.06] px-5 py-3.5">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5">
            <h2 className="font-display text-[15px] font-semibold tracking-tight text-slate-900">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs text-slate-500">{eyebrow}</div>}
        <h1 className="text-balance font-display text-[28px] font-semibold leading-tight tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-3xl text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto border-b border-slate-900/[.06] px-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={clsx(
            '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
            value === t.id ? 'border-indigo-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className={clsx('rounded-full px-1.5 text-xs tabular-nums', value === t.id ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-900/[.05] text-slate-500')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** A segmented control: one choice out of a few, with the current one raised. */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: { id: T; label: ReactNode; count?: number; accent?: boolean }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="surface-2 flex gap-0.5 rounded-xl p-[3px] text-sm">
      {options.map((o) => (
        <button
          key={o.id}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={clsx(
            'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 font-medium transition-colors',
            value === o.id ? 'bg-white text-slate-900 shadow-[0_1px_3px_rgba(22,24,64,.08),inset_0_1px_0_#fff] ring-1 ring-slate-900/[.06]' : 'text-slate-500 hover:text-slate-800',
          )}
        >
          {o.label}
          {o.count !== undefined && (
            <span className={clsx('rounded-full px-1.5 text-xs tabular-nums', o.accent && o.count ? 'bg-violet-100 text-violet-700' : 'bg-slate-900/[.05] text-slate-500')}>{o.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function KeyValue({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-slate-900/[.06] text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 py-1.5">
          <dt className="text-slate-500">{k}</dt>
          <dd className="break-words text-slate-800">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300/70 bg-white/30 p-6 text-center text-sm text-slate-500">{children}</div>;
}

export function Sparkline({ values, color = '#6366f1', width = 96, height = 24 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / Math.max(values.length - 1, 1)) * width, height - 2 - (v / max) * (height - 4)]);
  const end = pts[pts.length - 1];
  return (
    <svg width={width} height={height} className="shrink-0 overflow-visible" aria-hidden>
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={end[0]} cy={end[1]} r={2.2} fill={color} />
    </svg>
  );
}

/** Colour band for the 0–100 health score. */
function scoreTone(score: number) {
  return score >= 80 ? { stroke: '#10b981', glow: 'rgba(16,185,129,.35)' } : score >= 50 ? { stroke: '#f59e0b', glow: 'rgba(245,158,11,.3)' } : { stroke: '#e11d48', glow: 'rgba(244,63,94,.34)' };
}

/** The stack health score as a ring. It eases to a new value when the score changes. */
export function HealthRing({ score, size = 'lg', label = 'Stack health' }: { score: number; size?: 'lg' | 'sm'; label?: string }) {
  const box = size === 'lg' ? 148 : 92;
  const r = size === 'lg' ? 62 : 38;
  const width = size === 'lg' ? 11 : 8;
  const c = 2 * Math.PI * r;
  const tone = scoreTone(score);
  return (
    <div className="relative shrink-0" style={{ width: box, height: box }} title="100 minus weighted open issues (critical 8, high 5, medium 2, low 1)">
      <svg viewBox={`0 0 ${box} ${box}`} className="h-full w-full -rotate-90 overflow-visible" aria-hidden>
        <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke="rgb(var(--slate-900) / .08)" strokeWidth={width} />
        <circle
          cx={box / 2}
          cy={box / 2}
          r={r}
          fill="none"
          stroke={tone.stroke}
          strokeWidth={width}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(100, score)) / 100)}
          style={{ filter: `drop-shadow(0 0 6px ${tone.glow})`, transition: 'stroke-dashoffset 450ms cubic-bezier(.2,.8,.2,1), stroke 300ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className={clsx('font-display font-semibold tabular-nums tracking-tight text-slate-900', size === 'lg' ? 'text-[46px] leading-none' : 'text-[28px] leading-none')}>{score}</span>
        {size === 'lg' && <span className="mt-1.5 text-[11px] font-medium uppercase tracking-[.06em] text-slate-500">{label}</span>}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, children, wide }: { open: boolean; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-y-0 left-0 right-[var(--assistant-w,0px)] z-40 !m-0 flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-slate-900/15" onClick={onClose} />
      <aside className={clsx('glass-over relative m-2.5 flex w-full animate-slide-in-right flex-col overflow-hidden rounded-[22px] border border-white/70', wide ? 'max-w-3xl' : 'max-w-2xl')}>
        <button onClick={onClose} className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-900/[.05] hover:text-slate-700" aria-label="Close">
          <X size={18} />
        </button>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 !m-0 flex items-center justify-center p-4">
      <div className="absolute inset-0 animate-fade-in bg-slate-900/20" onClick={onClose} />
      <div className="glass-over relative w-full max-w-xl animate-pop-in rounded-2xl border border-white/70">
        <div className="border-b border-slate-900/[.06] px-5 py-4 font-display text-base font-semibold tracking-tight">{title}</div>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-900/[.06] px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  disabled,
  title,
  size = 'md',
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
  disabled?: boolean;
  title?: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
        variant === 'primary' && 'bg-indigo-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_6px_16px_-8px_rgba(79,70,229,.7)] hover:bg-indigo-700',
        variant === 'success' && 'bg-emerald-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_6px_16px_-8px_rgba(5,150,105,.7)] hover:bg-emerald-700',
        variant === 'secondary' && 'border border-slate-200 bg-white/70 text-slate-700 shadow-[inset_0_1px_0_#fff] hover:bg-white',
        variant === 'danger' && 'border border-rose-200 bg-white/70 text-rose-700 hover:bg-rose-50',
        variant === 'ghost' && 'text-slate-600 hover:bg-slate-900/[.05]',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** The expert layer: IDs, rule codes, raw config, lineage. Open by default; one click to fold away. */
export function Technical({ children, title = 'Technical details', summary, id }: { children: ReactNode; title?: string; summary?: ReactNode; id?: string }) {
  const [open, setOpen] = useState(true);
  return (
    <section id={id} className="surface-2 rounded-2xl">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-3 text-left" aria-expanded={open}>
        <ChevronRight size={14} className={clsx('shrink-0 text-slate-400 transition-transform duration-150', open && 'rotate-90')} />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</span>
        {summary && !open && <span className="truncate text-xs text-slate-400">{summary}</span>}
      </button>
      {open && <div className="space-y-6 border-t border-slate-900/[.06] px-4 py-4">{children}</div>}
    </section>
  );
}

export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-[.08em] text-slate-500">{children}</h3>
      {actions}
    </div>
  );
}

const PLAIN_SEVERITY_STYLE: Record<Severity, string> = {
  critical: 'bg-rose-600 text-white ring-rose-600 shadow-[0_4px_12px_-4px_rgba(225,29,72,.5)]',
  high: 'bg-rose-50 text-rose-700 ring-rose-200',
  medium: 'bg-amber-50 text-amber-800 ring-amber-200',
  low: 'bg-slate-100 text-slate-600 ring-slate-200',
};

/** Severity in plain words (Urgent / Important / Worth fixing / Minor). */
export function PlainSeverity({ severity }: { severity: Severity }) {
  return (
    <Badge className={PLAIN_SEVERITY_STYLE[severity]}>
      <span title={SEVERITY_PLAIN[severity].hint}>{SEVERITY_PLAIN[severity].label}</span>
    </Badge>
  );
}

export const SEVERITY_DOT: Record<Severity, string> = { critical: 'bg-rose-600', high: 'bg-rose-400', medium: 'bg-amber-400', low: 'bg-slate-300' };

export const PROBLEM_STATUS: Record<ProblemStatus, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-white/70 text-slate-700 ring-slate-300' },
  review_requested: { label: 'Review requested', cls: 'bg-violet-50 text-violet-700 ring-violet-200' },
  approved: { label: 'Fix approved', cls: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  fixed: { label: 'Fixed', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  verifying: { label: 'Fixed — verifying', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  dismissed: { label: 'Dismissed', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
  expected: { label: 'Expected', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
};

export function ProblemStatusBadge({ status }: { status: ProblemStatus }) {
  return <Badge className={PROBLEM_STATUS[status].cls}>{PROBLEM_STATUS[status].label}</Badge>;
}

export function ToolDots({ tools }: { tools: ToolId[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {tools.map((t) => (
        <ToolBadge key={t} tool={t} size="xs" />
      ))}
    </span>
  );
}
