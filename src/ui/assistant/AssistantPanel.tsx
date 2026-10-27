import clsx from 'clsx';
import { AlertTriangle, ArrowUp, ChevronDown, ChevronRight, GitCommitHorizontal, LineChart, Loader2, Plus, RotateCcw, Sparkles, Target, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { estimateTokens, resolveContext, type ContextItem, type ResolvedContext } from '../../assistant/context';
import { respond, suggestions, type ChatAction } from '../../assistant/respond';
import { useStore } from '../../store';
import { useChat, type ChatMessage } from '../../store/chat';
import { useUi } from '../../store/ui';
import { Markdown } from '../components/Markdown';
import { useAssistantData, useConversionGrid, useProblems } from '../hooks';
import { TOOLS } from '../meta';
import { buildSearchItems, searchItems } from '../search';

const uid = () => Math.random().toString(36).slice(2, 10);

/** Icon for a context chip. */
function ContextIcon({ item }: { item: ContextItem }) {
  const byId = useStore((s) => s.entities);
  if (item.kind === 'problem') return <AlertTriangle size={12} className="shrink-0 text-rose-500" />;
  if (item.kind === 'metric') return <LineChart size={12} className="shrink-0 text-sky-600" />;
  if (item.kind === 'conversion') return <Target size={12} className="shrink-0 text-emerald-600" />;
  if (item.kind === 'change') return <GitCommitHorizontal size={12} className="shrink-0 text-slate-500" />;
  const e = byId.find((x) => x.id === item.id);
  return <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: e ? TOOLS[e.tool].color : '#94a3b8' }} />;
}

function Chip({ r, onRemove, onClick, active }: { r: ResolvedContext; onRemove?: () => void; onClick?: () => void; active?: boolean }) {
  return (
    <span
      className={clsx(
        'inline-flex max-w-[220px] items-center gap-1.5 rounded-md border bg-white py-0.5 pl-1.5 text-xs text-slate-700',
        onRemove ? 'pr-0.5' : 'pr-1.5',
        active ? 'border-violet-400 ring-2 ring-violet-100' : 'border-slate-200',
      )}
    >
      <ContextIcon item={r.item} />
      <button onClick={onClick} className="truncate text-left hover:text-violet-700" title={`${r.sublabel}: ${r.label}${onClick ? ' — click to see exactly what is sent' : ''}`}>
        {r.label}
      </button>
      {onRemove && (
        <button onClick={onRemove} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Remove ${r.label}`}>
          <X size={11} />
        </button>
      )}
    </span>
  );
}

/** Search popover for adding context via "+" or "@". */
function ContextPicker({ query, onQuery, onPick, onClose, showInput }: { query: string; onQuery?: (q: string) => void; onPick: (c: ContextItem) => void; onClose: () => void; showInput: boolean }) {
  const problems = useProblems();
  const entities = useStore((s) => s.entities);
  const grid = useConversionGrid();
  const all = useMemo(() => buildSearchItems(problems, entities, grid).filter((i) => i.context), [problems, entities, grid]);
  const results = searchItems(all, query, 8);
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === 'Enter' && results[active]) {
        e.preventDefault();
        e.stopPropagation();
        onPick(results[active].context!);
      } else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [results, active, onPick, onClose]);
  return (
    <div className="absolute inset-x-3 bottom-full z-20 mb-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
      {showInput && (
        <input autoFocus value={query} onChange={(e) => onQuery?.(e.target.value)} placeholder="Search problems, conversions, tags, events…" className="w-full border-b border-slate-100 px-3 py-2 text-sm outline-none" />
      )}
      <ul className="max-h-64 overflow-y-auto py-1">
        {results.map((r, i) => (
          <li key={r.id}>
            <button onMouseEnter={() => setActive(i)} onClick={() => onPick(r.context!)} className={clsx('flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm', i === active && 'bg-violet-50')}>
              <ContextIcon item={r.context!} />
              <span className="min-w-0 flex-1 truncate">{r.label}</span>
              <span className="shrink-0 text-[11px] text-slate-400">{r.sublabel}</span>
            </button>
          </li>
        ))}
        {!results.length && <li className="px-3 py-2 text-sm text-slate-400">No matches</li>}
      </ul>
      <div className="border-t border-slate-100 bg-slate-50 px-3 py-1 text-[11px] text-slate-400">↑↓ to move · Enter to add · Esc to close</div>
    </div>
  );
}

function Steps({ steps, pending }: { steps: string[]; pending?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!steps.length) return null;
  const show = open || pending;
  return (
    <div className="mb-2 text-xs text-slate-500">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 hover:text-slate-700">
        {pending ? <Loader2 size={12} className="animate-spin" /> : show ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {pending ? 'Working…' : `${steps.length} step${steps.length > 1 ? 's' : ''}`}
      </button>
      {show && (
        <ul className="ml-1.5 mt-1 space-y-0.5 border-l border-slate-200 pl-3">
          {steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Message({ m, data, onAction }: { m: ChatMessage; data: ReturnType<typeof useAssistantData>; onAction: (a: ChatAction) => void }) {
  if (m.role === 'user') {
    const chips = m.context.map((c) => resolveContext(c, data)).filter((r): r is ResolvedContext => !!r);
    return (
      <div className="flex flex-col items-end gap-1.5">
        <div className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-violet-600 px-3 py-2 text-sm text-white">{m.text}</div>
        {chips.length > 0 && (
          <div className="flex max-w-[90%] flex-wrap justify-end gap-1">
            {chips.map((r) => (
              <Chip key={r.key} r={r} />
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <div>
      <Steps steps={m.steps ?? []} pending={m.pending && !m.text} />
      {m.text && <Markdown text={m.text} />}
      {!m.pending && m.actions && m.actions.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {m.actions.map((a) => (
            <button key={a.label} onClick={() => onAction(a)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm hover:border-violet-300 hover:text-violet-700">
              {a.add ? <Plus size={12} /> : <ChevronRight size={12} />}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AssistantPanel() {
  const open = useUi((s) => s.assistantOpen);
  const setOpen = useUi((s) => s.setAssistantOpen);
  const { context, messages, remove, push, update, clearContext, newChat, add } = useChat();
  const data = useAssistantData();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ mode: 'plus' | 'at'; query: string } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const resolved = useMemo(() => context.map((c) => resolveContext(c, data)).filter((r): r is ResolvedContext => !!r), [context, data]);
  const lastContext = [...messages].reverse().find((m) => m.role === 'user' && m.context.length)?.context ?? [];
  const effective = context.length ? context : lastContext;
  const tokens = resolved.reduce((s, r) => s + estimateTokens(r.payload), 0);
  const busy = messages.some((m) => m.pending);
  const prompts = suggestions(effective, data);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open, context.length]);

  if (!open) return null;

  const send = (raw: string) => {
    const msg = raw.trim();
    if (!msg || busy) return;
    const ctx = effective;
    push({ id: uid(), role: 'user', text: msg, context: context });
    clearContext();
    setText('');
    setPreview(null);
    const reply = respond(msg, ctx, data);
    const id = uid();
    push({ id, role: 'assistant', text: '', context: [], steps: [], pending: true });
    // Reveal the steps, then stream the text, so it reads like an agent at work.
    reply.steps.forEach((_, i) => setTimeout(() => update(id, { steps: reply.steps.slice(0, i + 1) }), 260 * (i + 1)));
    const start = 260 * (reply.steps.length + 1);
    const chunks = Math.ceil(reply.text.length / 14);
    for (let i = 1; i <= chunks; i++) setTimeout(() => update(id, { text: reply.text.slice(0, i * 14) }), start + i * 12);
    setTimeout(() => update(id, { text: reply.text, actions: reply.actions, pending: false }), start + chunks * 12 + 30);
  };

  const onAction = (a: ChatAction) => {
    if (a.add) add(a.add);
    if (a.to) {
      const [path, hash] = a.to.split('#');
      navigate(path + (hash ? `#${hash}` : ''));
    }
  };

  const pick = (c: ContextItem) => {
    add(c);
    if (picker?.mode === 'at') setText((t) => t.replace(/@[^@]*$/, ''));
    setPicker(null);
    input.current?.focus();
  };

  const previewed = resolved.find((r) => r.key === preview);

  return (
    <aside className="sticky top-0 flex h-screen w-[420px] shrink-0 flex-col border-l border-slate-200 bg-white">
      <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5">
        <Sparkles size={16} className="text-violet-600" />
        <span className="text-sm font-semibold text-slate-900">Assistant</span>
        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800" title="Phase 1 prototype: replies are scripted from the demo data, not generated by an LLM">
          Demo replies
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          {messages.length > 0 && (
            <button onClick={newChat} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800" title="Start a new chat">
              <RotateCcw size={12} /> New
            </button>
          )}
          <button onClick={() => setOpen(false)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close assistant" title="Close (⌘I)">
            <X size={16} />
          </button>
        </div>
      </header>

      <div ref={scroller} className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-3 text-sm text-slate-600">
            <p>Ask about anything in BrightPath Solar's stack. I answer from the latest scan.</p>
            <div className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
              <div className="mb-1 font-medium text-slate-700">Give me context</div>
              Click <Sparkles size={11} className="inline text-violet-600" /> <strong>Ask AI</strong> on a problem, tick rows in a table, drag across a chart to pick dates, or type <kbd className="rounded border border-slate-200 bg-white px-1">@</kbd> to search. You'll see exactly what gets sent before you send it.
            </div>
          </div>
        )}
        {messages.map((m) => (
          <Message key={m.id} m={m} data={data} onAction={onAction} />
        ))}
      </div>

      <div className="relative border-t border-slate-200 bg-slate-50/60 px-3 pb-3 pt-2.5">
        {picker && (
          <ContextPicker
            query={picker.query}
            showInput={picker.mode === 'plus'}
            onQuery={(q) => setPicker({ ...picker, query: q })}
            onPick={pick}
            onClose={() => setPicker(null)}
          />
        )}
        {previewed && (
          <div className="absolute inset-x-3 bottom-full z-10 mb-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <div className="text-xs">
                <span className="font-medium text-slate-800">Exactly what will be sent</span>
                <span className="ml-1.5 text-slate-400">~{estimateTokens(previewed.payload)} tokens</span>
              </div>
              <button onClick={() => setPreview(null)} className="rounded p-0.5 text-slate-400 hover:text-slate-700" aria-label="Close preview">
                <X size={14} />
              </button>
            </div>
            <pre className="max-h-72 overflow-auto bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">{JSON.stringify(previewed.payload, null, 2)}</pre>
          </div>
        )}

        <div className="mb-2 flex flex-wrap items-center gap-1">
          {resolved.map((r) => (
            <Chip key={r.key} r={r} active={preview === r.key} onClick={() => setPreview(preview === r.key ? null : r.key)} onRemove={() => remove(r.key)} />
          ))}
          <button onClick={() => setPicker(picker?.mode === 'plus' ? null : { mode: 'plus', query: '' })} className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-1.5 py-0.5 text-xs text-slate-500 hover:border-violet-400 hover:text-violet-700">
            <Plus size={11} /> Add context
          </button>
          <span className="ml-auto text-[11px] text-slate-400">
            {resolved.length ? `~${tokens.toLocaleString()} tokens` : lastContext.length ? 'Follow-up: same context as before' : 'No context: whole stack'}
          </span>
        </div>

        {!text && !busy && (
          <div className="mb-2 flex flex-wrap gap-1">
            {prompts.map((p) => (
              <button key={p} onClick={() => send(p)} className="rounded-full border border-violet-200 bg-white px-2.5 py-0.5 text-xs text-violet-700 hover:bg-violet-50">
                {p}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-white p-1.5 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100">
          <textarea
            ref={input}
            value={text}
            rows={Math.min(5, Math.max(1, text.split('\n').length))}
            onChange={(e) => {
              const v = e.target.value;
              setText(v);
              const at = v.match(/(?:^|\s)@([^@\n]*)$/);
              setPicker(at ? { mode: 'at', query: at[1] } : picker?.mode === 'at' ? null : picker);
            }}
            onKeyDown={(e) => {
              if (picker?.mode === 'at' && ['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return;
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
            placeholder={resolved.length ? 'Ask about the selected items…' : 'Ask anything, or type @ to add context'}
            className="max-h-32 flex-1 resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-slate-400"
          />
          <button onClick={() => send(text)} disabled={!text.trim() || busy} className="rounded-lg bg-violet-600 p-1.5 text-white transition hover:bg-violet-700 disabled:opacity-40" aria-label="Send">
            <ArrowUp size={16} />
          </button>
        </div>
        <div className="mt-1.5 text-center text-[10px] text-slate-400">The assistant suggests; it never changes your platforms. You review and apply every fix.</div>
      </div>
    </aside>
  );
}
