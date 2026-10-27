import clsx from 'clsx';
import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Entity, Health, Severity, ToolId } from '../../model/schema';
import { useEntityMap } from '../../store';
import { HEALTH, KIND_LABEL, SEVERITY, TOOLS, entityPath } from '../meta';

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', className)}>{children}</span>;
}

export function HealthDot({ health, className }: { health: Health; className?: string }) {
  return <span title={HEALTH[health].label} className={clsx('inline-block h-2 w-2 shrink-0 rounded-full', HEALTH[health].dot, className)} />;
}

export function HealthBadge({ health }: { health: Health }) {
  return (
    <Badge className={HEALTH[health].badge}>
      <HealthDot health={health} />
      {HEALTH[health].label}
    </Badge>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge className={SEVERITY[severity].badge}>{SEVERITY[severity].label}</Badge>;
}

export function ToolBadge({ tool, size = 'sm' }: { tool: ToolId; size?: 'sm' | 'xs' }) {
  const t = TOOLS[tool];
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded font-medium', t.bg, t.text, size === 'xs' ? 'px-1 py-px text-[10px]' : 'px-1.5 py-0.5 text-xs')}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.color }} />
      {t.short}
    </span>
  );
}

/** A clickable chip for any entity; navigates to that entity on its tool screen. */
export function EntityChip({ id, entity, highlight, showTool = true, showKind = false }: { id?: string; entity?: Entity; highlight?: boolean; showTool?: boolean; showKind?: boolean }) {
  const map = useEntityMap();
  const e = entity ?? (id ? map.get(id) : undefined);
  if (!e) return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-400 line-through">{id?.split(':').pop()}</span>;
  const t = TOOLS[e.tool];
  return (
    <Link
      to={entityPath(e.tool, e.id)}
      title={`${t.label} · ${KIND_LABEL[e.kind]} · ${e.name}`}
      className={clsx(
        'inline-flex max-w-full items-center gap-1.5 rounded-md border bg-white px-2 py-1 text-xs font-medium text-slate-800 shadow-sm transition hover:border-slate-400 hover:shadow',
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

export function Card({ className, children, title, actions }: { className?: string; children: ReactNode; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={clsx('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto border-b border-slate-200 px-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={clsx(
            '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition',
            value === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className={clsx('rounded-full px-1.5 text-xs', value === t.id ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function KeyValue({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-slate-100 text-sm">
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
  return <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">{children}</div>;
}

export function Sparkline({ values, color = '#6366f1', width = 96, height = 24 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / Math.max(values.length - 1, 1)) * width},${height - 2 - (v / max) * (height - 4)}`).join(' ');
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
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
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/20" onClick={onClose} />
      <aside className={clsx('relative flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl', wide ? 'max-w-3xl' : 'max-w-2xl')}>
        <button onClick={onClose} className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-xl bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-5 py-4 text-base font-semibold">{title}</div>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
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
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
  disabled?: boolean;
  title?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
        variant === 'primary' && 'bg-indigo-600 text-white hover:bg-indigo-700',
        variant === 'success' && 'bg-emerald-600 text-white hover:bg-emerald-700',
        variant === 'secondary' && 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
        variant === 'danger' && 'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50',
        variant === 'ghost' && 'text-slate-600 shadow-none hover:bg-slate-100',
      )}
    >
      {children}
    </button>
  );
}
