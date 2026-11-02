import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Per-viewer UI preferences: who is looking (demo role switch) and which panels are open.
// Kept apart from the demo data so "Reset demo" doesn't change how the app is laid out.
// Everyone sees the same, fully detailed view; the role only changes what they can do.

export type Role = 'client' | 'consultant';

export const PEOPLE: Record<Role, { name: string; title: string; org: string; initials: string }> = {
  client: { name: 'Jamie', title: 'Marketing manager', org: 'BrightPath Solar', initials: 'J' },
  consultant: { name: 'Sam', title: 'Tracking consultant', org: 'Agency', initials: 'S' },
};

interface UiState {
  role: Role;
  assistantOpen: boolean;
  paletteOpen: boolean;
  setRole: (r: Role) => void;
  setAssistantOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      role: 'client',
      assistantOpen: false,
      paletteOpen: false,
      setRole: (role) => set({ role }),
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
      partialize: (s) => ({ role: s.role, assistantOpen: s.assistantOpen }),
    },
  ),
);

export function useRole() {
  return useUi((s) => s.role);
}

/** Change-log name for whoever is using the app. */
export function actorName(role: Role) {
  const p = PEOPLE[role];
  return `${p.name} (${p.org})`;
}
