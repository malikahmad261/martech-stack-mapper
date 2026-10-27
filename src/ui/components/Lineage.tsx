import clsx from 'clsx';
import { ArrowRight } from 'lucide-react';
import { Fragment, useMemo } from 'react';
import { FLOW_LABELS, Graph, LINK_LABELS, type LineagePath } from '../../engine/graph';
import type { Link } from '../../model/schema';
import { useStore } from '../../store';
import { HEALTH } from '../meta';
import { EmptyState, EntityChip } from './common';

export function useGraph() {
  const entities = useStore((s) => s.entities);
  const links = useStore((s) => s.links);
  return useMemo(() => new Graph(entities, links), [entities, links]);
}

function Arrow({ link, highlighted }: { link?: Link; highlighted?: boolean }) {
  const h = link ? HEALTH[link.health] : HEALTH.unknown;
  return (
    <span className="inline-flex shrink-0 flex-col items-center px-0.5" title={link ? `${LINK_LABELS[link.type]} — ${link.evidence.join('; ')}` : undefined}>
      <span className={clsx('text-[9px] leading-none', highlighted ? 'font-semibold text-rose-600' : 'text-slate-400')}>{link ? FLOW_LABELS[link.type] : ''}</span>
      <ArrowRight size={14} style={{ color: highlighted ? '#e11d48' : link?.health === 'healthy' ? '#94a3b8' : h.stroke }} strokeWidth={link?.health === 'healthy' && !highlighted ? 1.5 : 2.5} />
    </span>
  );
}

/**
 * Renders lineage paths as chains of clickable chips. Paths are always shown in data-flow order
 * (source → destination), so arrows read left to right regardless of direction walked.
 */
export function LineagePaths({ paths, focusId, highlightLinks, empty }: { paths: LineagePath[]; focusId: string; highlightLinks?: Set<string>; empty: string }) {
  const g = useGraph();
  if (!paths.length) return <EmptyState>{empty}</EmptyState>;
  return (
    <ul className="space-y-2">
      {paths.map((p, i) => (
        <li key={i} className="flex flex-wrap items-center gap-y-1.5 rounded-lg bg-slate-50 p-2">
          {p.steps.map((s, j) => {
            // A step's linkId connects it to the previous step in the list.
            const link = j > 0 ? g.linkById.get(p.steps[j].linkId ?? '') : undefined;
            return (
              <Fragment key={j}>
                {j > 0 && <Arrow link={link} highlighted={!!link && highlightLinks?.has(link.id)} />}
                <EntityChip id={s.entityId} highlight={s.entityId === focusId} />
              </Fragment>
            );
          })}
        </li>
      ))}
    </ul>
  );
}

/** Upstream and downstream sections for one entity. */
export function LineageSections({ entityId, highlightLinks }: { entityId: string; highlightLinks?: Set<string> }) {
  const g = useGraph();
  const up = useMemo(() => dedupe(g.lineage(entityId, 'up')), [g, entityId]);
  const down = useMemo(() => dedupe(g.lineage(entityId, 'down')), [g, entityId]);
  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Upstream — where this comes from ({up.length})</h3>
        <LineagePaths paths={up} focusId={entityId} highlightLinks={highlightLinks} empty="Nothing upstream — this is where data enters the stack." />
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Downstream — where this goes ({down.length})</h3>
        <LineagePaths paths={down} focusId={entityId} highlightLinks={highlightLinks} empty="Nothing downstream depends on this." />
      </div>
    </div>
  );
}

function dedupe(paths: LineagePath[]) {
  const seen = new Set<string>();
  return paths.filter((p) => {
    const k = p.steps.map((s) => s.entityId).join('>');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
