import { useMemo } from 'react';
import type { AssistantData } from '../assistant/context';
import { buildConversionGrid } from '../insights/conversions';
import { buildProblems, isActiveProblem } from '../insights/problems';
import { useStore } from '../store';
import { useUi } from '../store/ui';
import { metricIndex } from './components/Charts';
import { useGraph } from './components/Lineage';

export function useProblems() {
  const issues = useStore((s) => s.issues);
  const anomalies = useStore((s) => s.anomalies);
  const fixes = useStore((s) => s.fixes);
  const entities = useStore((s) => s.entities);
  return useMemo(() => buildProblems({ issues, anomalies, fixes, entities }), [issues, anomalies, fixes, entities]);
}

export function useActiveProblems() {
  const problems = useProblems();
  return useMemo(() => problems.filter((p) => isActiveProblem(p) && !p.fyi), [problems]);
}

export function useConversionGrid() {
  const g = useGraph();
  const problems = useProblems();
  return useMemo(() => buildConversionGrid(g, metricIndex, problems), [g, problems]);
}

export function useAssistantData(): AssistantData {
  const graph = useGraph();
  const problems = useProblems();
  const grid = useConversionGrid();
  const changeEvents = useStore((s) => s.changeEvents);
  const tools = useStore((s) => s.tools);
  const role = useUi((s) => s.role);
  return useMemo(() => ({ graph, problems, grid, changeEvents, tools, role, metrics: metricIndex }), [graph, problems, grid, changeEvents, tools, role]);
}

export const problemPath = (id: string) => `/problems/${encodeURIComponent(id)}`;
