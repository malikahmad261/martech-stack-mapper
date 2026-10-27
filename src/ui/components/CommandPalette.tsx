import clsx from 'clsx';
import { CornerDownLeft, Search, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import { useChat } from '../../store/chat';
import { detailOf, useUi } from '../../store/ui';
import { useConversionGrid, useProblems } from '../hooks';
import { buildSearchItems, searchItems, type SearchItem } from '../search';

interface Command {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

/** ⌘K: jump anywhere, run an action, or (⌘Enter) hand the item to the assistant. */
export function CommandPalette({ onRescan }: { onRescan: () => void }) {
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPaletteOpen);
  const ui = useUi();
  const problems = useProblems();
  const entities = useStore((s) => s.entities);
  const grid = useConversionGrid();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const index = useMemo(() => buildSearchItems(problems, entities, grid), [problems, entities, grid]);

  const detailed = detailOf(ui) === 'detailed';
  const commands: Command[] = [
    { id: 'cmd:rescan', label: 'Re-scan now', hint: 'Action', run: onRescan },
    { id: 'cmd:detail', label: detailed ? 'Switch to Simple view' : 'Switch to Detailed view', hint: 'Action', run: () => ui.setDetail(detailed ? 'simple' : 'detailed') },
    { id: 'cmd:role', label: ui.role === 'client' ? 'View as consultant' : 'View as client', hint: 'Demo', run: () => ui.setRole(ui.role === 'client' ? 'consultant' : 'client') },
    { id: 'cmd:assistant', label: ui.assistantOpen ? 'Close assistant' : 'Open assistant', hint: '⌘I', run: () => ui.setAssistantOpen(!ui.assistantOpen) },
  ];
  const ql = q.trim().toLowerCase();
  const cmdMatches = commands.filter((c) => !ql || c.label.toLowerCase().includes(ql));
  const results = searchItems(index, q, 40);
  const rows: ({ type: 'cmd'; c: Command } | { type: 'item'; i: SearchItem })[] = [...results.map((i) => ({ type: 'item' as const, i })), ...cmdMatches.map((c) => ({ type: 'cmd' as const, c }))];

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
    }
  }, [open]);
  useEffect(() => setActive(0), [q]);

  if (!open) return null;

  const choose = (idx: number, toChat = false) => {
    const r = rows[idx];
    if (!r) return;
    setOpen(false);
    if (r.type === 'cmd') return r.c.run();
    if (toChat && r.i.context) return useChat.getState().add(r.i.context);
    if (r.i.to) navigate(r.i.to);
  };

  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 bg-slate-900/30" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-slate-100 px-3">
          <Search size={16} className="text-slate-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, rows.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                choose(active, e.metaKey || e.ctrlKey);
              } else if (e.key === 'Escape') setOpen(false);
            }}
            placeholder="Search problems, conversions, tags, events, pages…"
            className="w-full py-3 text-sm outline-none"
          />
        </div>
        <ul className="max-h-[50vh] overflow-y-auto py-1">
          {rows.map((r, idx) => {
            const group = r.type === 'cmd' ? 'Actions' : r.i.group;
            const header = group !== lastGroup;
            lastGroup = group;
            return (
              <li key={r.type === 'cmd' ? r.c.id : r.i.id}>
                {header && <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group}</div>}
                <div
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => choose(idx)}
                  className={clsx('flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm', idx === active ? 'bg-indigo-50' : '')}
                >
                  {r.type === 'item' && r.i.color && <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: r.i.color }} />}
                  <span className="min-w-0 flex-1 truncate text-slate-800">{r.type === 'cmd' ? r.c.label : r.i.label}</span>
                  <span className="shrink-0 text-xs text-slate-400">{r.type === 'cmd' ? r.c.hint : r.i.sublabel}</span>
                  {r.type === 'item' && r.i.context && idx === active && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        choose(idx, true);
                      }}
                      className="flex items-center gap-1 rounded border border-violet-200 bg-white px-1.5 py-0.5 text-[11px] text-violet-700"
                      title="Add to chat (⌘Enter)"
                    >
                      <Sparkles size={11} /> Ask AI
                    </button>
                  )}
                </div>
              </li>
            );
          })}
          {!rows.length && <li className="px-3 py-6 text-center text-sm text-slate-400">Nothing matches "{q}"</li>}
        </ul>
        <div className="flex items-center gap-3 border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <CornerDownLeft size={11} /> open
          </span>
          <span>⌘↵ add to chat</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
