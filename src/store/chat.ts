import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { contextKey, type ContextItem } from '../assistant/context';
import type { ChatAction } from '../assistant/respond';
import { useUi } from './ui';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Context sent with a user message. */
  context: ContextItem[];
  steps?: string[];
  actions?: ChatAction[];
  /** Assistant reply still "thinking"/streaming. */
  pending?: boolean;
}

interface ChatState {
  /** Items queued in the composer for the next message. */
  context: ContextItem[];
  messages: ChatMessage[];
  add: (items: ContextItem | ContextItem[], opts?: { open?: boolean }) => void;
  remove: (key: string) => void;
  has: (item: ContextItem) => boolean;
  clearContext: () => void;
  push: (m: ChatMessage) => void;
  update: (id: string, patch: Partial<ChatMessage>) => void;
  newChat: () => void;
}

export const useChat = create<ChatState>()(
  persist(
    (set, get) => ({
      context: [],
      messages: [],
      add: (items, opts) => {
        const list = Array.isArray(items) ? items : [items];
        const keys = new Set(get().context.map(contextKey));
        set({ context: [...get().context, ...list.filter((i) => !keys.has(contextKey(i)))] });
        if (opts?.open !== false) useUi.getState().setAssistantOpen(true);
      },
      remove: (key) => set({ context: get().context.filter((c) => contextKey(c) !== key) }),
      has: (item) => get().context.some((c) => contextKey(c) === contextKey(item)),
      clearContext: () => set({ context: [] }),
      push: (m) => set({ messages: [...get().messages, m] }),
      update: (id, patch) => set({ messages: get().messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) }),
      newChat: () => set({ messages: [], context: [] }),
    }),
    {
      name: 'martech-stack-mapper:chat',
      storage: createJSONStorage(() => {
        try {
          return localStorage;
        } catch {
          return sessionStorage;
        }
      }),
      partialize: (s) => ({ context: s.context, messages: s.messages.filter((m) => !m.pending) }),
    },
  ),
);

/** Subscribe-friendly check for whether an item is queued. */
export function useInChat(item: ContextItem) {
  const key = contextKey(item);
  return useChat((s) => s.context.some((c) => contextKey(c) === key));
}
