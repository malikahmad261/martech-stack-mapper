import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { LATEST_SCAN_AT } from '../connectors/demo/timeline';
import { buildDemoState } from '../engine/demo';
import * as wf from '../engine/workflow';
import type { Anomaly, FixOperation, Scan } from '../model/schema';
import { actorName, useUi } from './ui';

const demo = buildDemoState();
export const METRICS = demo.source.metrics;
export const SNAPSHOTS = demo.source.snapshots;

const STATE_VERSION = 4;

function initialData(): wf.AppData {
  return {
    baseEntities: demo.source.entities,
    tools: demo.tools,
    entities: demo.entities,
    links: demo.links,
    issues: demo.issues,
    fixes: demo.fixes,
    anomalies: demo.anomalies,
    scans: demo.scans,
    changeEvents: demo.source.changeEvents,
    ruleResults: demo.ruleResults,
  };
}

/** The demo world lives on 27 Oct 2026; keep new events after the seeded latest scan. */
export function nowIso(): string {
  const now = Date.now();
  const floor = new Date(LATEST_SCAN_AT).getTime() + 3 * 3600_000;
  return new Date(Math.max(now, floor)).toISOString();
}

interface Actions {
  rescan: (trigger?: Scan['trigger']) => void;
  updateFix: (fixId: string, patch: { current?: FixOperation[]; notes?: string }) => void;
  revertFix: (fixId: string) => void;
  setFixStatus: (fixId: string, status: 'approved' | 'rejected' | 'draft') => void;
  applyFix: (fixId: string) => void;
  /** Approve and apply in one step (a client applying a low-risk fix). */
  approveAndApply: (fixId: string) => void;
  requestReview: (fixId: string, note: string) => void;
  setIssueDismissed: (issueId: string, dismissed: boolean) => void;
  setAnomalyStatus: (id: string, status: Anomaly['status']) => void;
  reset: () => void;
}

export type Store = wf.AppData & Actions & { version: number };

export const useStore = create<Store>()(
  persist(
    (set, get) => {
      const run = (fn: (d: wf.AppData) => wf.AppData) => set(fn(get()));
      const by = () => wf.viaApp(actorName(useUi.getState().role));
      return {
        ...initialData(),
        version: STATE_VERSION,
        rescan: (trigger = 'on_demand') => run((d) => wf.rescan(d, METRICS, nowIso(), trigger)),
        updateFix: (fixId, patch) => run((d) => wf.updateFix(d, fixId, patch, nowIso(), by())),
        revertFix: (fixId) => run((d) => wf.revertFix(d, fixId, nowIso(), by())),
        setFixStatus: (fixId, status) => run((d) => wf.setFixStatus(d, fixId, status, nowIso(), by())),
        applyFix: (fixId) => run((d) => wf.applyFix(d, METRICS, fixId, nowIso(), by())),
        approveAndApply: (fixId) =>
          run((d) => {
            const at = nowIso();
            return wf.applyFix(wf.setFixStatus(d, fixId, 'approved', at, by()), METRICS, fixId, at, by());
          }),
        requestReview: (fixId, note) => run((d) => wf.requestReview(d, fixId, nowIso(), actorName(useUi.getState().role), note)),
        setIssueDismissed: (issueId, dismissed) => run((d) => wf.setIssueDismissed(d, issueId, dismissed)),
        setAnomalyStatus: (id, status) => run((d) => wf.setAnomalyStatus(d, id, status)),
        reset: () => set({ ...initialData(), version: STATE_VERSION }),
      };
    },
    {
      name: 'martech-stack-mapper',
      version: STATE_VERSION,
      storage: createJSONStorage(() => {
        try {
          return localStorage;
        } catch {
          return sessionStorage;
        }
      }),
      partialize: (s) => ({
        baseEntities: s.baseEntities,
        tools: s.tools,
        entities: s.entities,
        links: s.links,
        issues: s.issues,
        fixes: s.fixes,
        anomalies: s.anomalies,
        scans: s.scans,
        changeEvents: s.changeEvents,
        ruleResults: s.ruleResults,
        version: s.version,
      }),
      // A stored state from an older build is discarded rather than migrated.
      migrate: () => ({ ...initialData(), version: STATE_VERSION }) as never,
    },
  ),
);

// Selectors / helpers
export function useEntityMap() {
  const entities = useStore((s) => s.entities);
  return useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);
}
