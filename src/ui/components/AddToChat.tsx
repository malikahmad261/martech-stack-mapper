import clsx from 'clsx';
import { Check, MessageSquarePlus, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { contextKey as contextKeyOf, type ContextItem } from '../../assistant/context';
import { useChat, useInChat } from '../../store/chat';

/** Adds an item to the assistant's context (and opens the assistant). Click again to remove it. */
export function AddToChat({ item, variant = 'icon', label = 'Ask AI', className }: { item: ContextItem; variant?: 'icon' | 'button'; label?: string; className?: string }) {
  const inChat = useInChat(item);
  const { add, remove } = useChat.getState();
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (inChat) remove(contextKeyOf(item));
    else add(item);
  };
  if (variant === 'button')
    return (
      <button
        onClick={toggle}
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium shadow-sm transition',
          inChat ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:text-violet-700',
          className,
        )}
        title={inChat ? 'Remove from the assistant' : 'Add to the assistant and ask about it'}
      >
        {inChat ? <Check size={13} /> : <Sparkles size={13} />}
        {inChat ? 'Added to chat' : label}
      </button>
    );
  return (
    <button
      onClick={toggle}
      aria-label={inChat ? 'Remove from chat' : 'Add to chat'}
      title={inChat ? 'In chat — click to remove' : 'Add to chat'}
      className={clsx(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition',
        inChat ? 'bg-violet-100 text-violet-700' : 'text-slate-400 hover:bg-violet-50 hover:text-violet-700',
        className,
      )}
    >
      {inChat ? <Check size={14} /> : <MessageSquarePlus size={14} />}
    </button>
  );
}


/** Floating bar shown while rows are checked. */
export function SelectionBar({ items, onClear, noun = 'item' }: { items: ContextItem[]; onClear: () => void; noun?: string }) {
  const [flash, setFlash] = useState(false);
  if (!items.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-5 left-0 right-[var(--assistant-w,0px)] z-30 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-900 py-2 pl-4 pr-2 text-sm text-white shadow-2xl">
        <span>
          {items.length} {noun}
          {items.length > 1 ? 's' : ''} selected
        </span>
        <button
          onClick={() => {
            useChat.getState().add(items);
            setFlash(true);
            setTimeout(() => {
              setFlash(false);
              onClear();
            }, 350);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold hover:bg-violet-400"
        >
          {flash ? <Check size={13} /> : <Sparkles size={13} />}
          Add to chat
        </button>
        <button onClick={onClear} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Clear selection">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      onClick={(e) => e.stopPropagation()}
      onChange={onChange}
      className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300 text-violet-600 accent-violet-600"
    />
  );
}
