import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Per-viewer UI preferences: who is looking (demo role switch) and how much detail they want.
// Kept apart from the demo data so "Reset demo" doesn't change how the app is laid out.

export type Role = 'client' | 'consultant';
export type Detail = 'simple' | 'detailed';

export const PEOPLE: Record<Role, { name: string; title: string; org: string; initials: string }> = {
  client: { name: 'Jamie', title: 'Marketing manager', org: 'BrightPath Solar', initials: 'J' },
  consultant: { name: 'Sam', title: 'Tracking consultant', org: 'Agency', initials: 'S' },
};

export const ROLE_DEFAULT_DETAIL: Record<Role, Detail> = { client: 'simple', consultant: 'detailed' };

interface UiState {
  role: Role;
  /** null = follow the role's default. */
  detailOverride: Detail | null;
  assistantOpen: boolean;
  paletteOpen: boolean;
  setRole: (r: Role) => void;
  setDetail: (d: Detail) => void;
  setAssistantOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      role: 'client',
      detailOverride: null,
      assistantOpen: false,
      paletteOpen: false,
      // Switching role resets detail to that role's default.
      setRole: (role) => set({ role, detailOverride: null }),
      setDetail: (d) => set((s) => ({ detailOverride: d === ROLE_DEFAULT_DETAIL[s.role] ? null : d })),
      setAssistantOpen: (assistantOpen) => set({ assistantOpen }),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
    }),
    {
      name: 'martech-stack-mapper:ui',
      storage: createJSONStorage(() => {
        try {
          return localStorage;
        } catch {
          return sessionStorage;
        }
      }),
      partialize: (s) => ({ role: s.role, detailOverride: s.detailOverride, assistantOpen: s.assistantOpen }),
    },
  ),
);

export const detailOf = (s: Pick<UiState, 'role' | 'detailOverride'>): Detail => s.detailOverride ?? ROLE_DEFAULT_DETAIL[s.role];

/** True when the viewer wants the expert layer (IDs, rule codes, raw config) shown by default. */
export function useDetailed() {
  return useUi((s) => detailOf(s) === 'detailed');
}

export function useRole() {
  return useUi((s) => s.role);
}

/** Change-log name for whoever is using the app. */
export function actorName(role: Role) {
  const p = PEOPLE[role];
  return `${p.name} (${p.org})`;
}
