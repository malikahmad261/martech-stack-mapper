import clsx from 'clsx';
import { ArrowRight } from 'lucide-react';
import { useMemo } from 'react';
import { worstHealth } from '../../engine/scan';
import type { Health, ToolId } from '../../model/schema';
import { HEALTH, TOOLS } from '../meta';
import { useGraph } from './Lineage';

// Lineage collapsed to tools: "Website → GTM Web → GTM Server → Meta". The simple view of how a
// conversion travels, with each hop coloured by the worst health of the entities and links in it.

interface Hop {
  tool: ToolId;
  names: string[];
  health: Health;
}

export function useJourneys(entityId: string) {
  const g = useGraph();
  return useMemo(() => {
    const seen = new Set<string>();
    const out: Hop[][] = [];
    for (const p of g.lineage(entityId, 'up')) {
      const hops: Hop[] = [];
      p.steps.forEach((s, i) => {
        const e = g.byId.get(s.entityId);
        if (!e) return;
        // A step's link joins it to the previous step.
        const link = i > 0 && s.linkId ? g.linkById.get(s.linkId) : undefined;
        const hs: Health[] = [e.health === 'inactive' ? 'healthy' : e.health, ...(link ? [link.health] : [])];
        const last = hops[hops.length - 1];
        if (last && last.tool === e.tool) {
          last.names.push(e.name);
          last.health = worstHealth([last.health, ...hs]);
        } else hops.push({ tool: e.tool, names: [e.name], health: worstHealth(hs) });
      });
      const key = hops.map((h) => h.tool).join('>');
      if (!seen.has(key)) {
        seen.add(key);
        out.push(hops);
      }
    }
    return out;
  }, [g, entityId]);
}

export function Journey({ entityId }: { entityId: string }) {
  const journeys = useJourneys(entityId);
  if (!journeys.length) return <div className="text-sm text-slate-500">Data arrives here directly (for example, an offline upload).</div>;
  return (
    <div className="space-y-2">
      {journeys.map((hops, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5">
          {journeys.length > 1 && <span className="mr-1 w-14 text-xs text-slate-400">{hops.some((h) => h.tool === 'gtm_server') ? 'Server' : 'Browser'}</span>}
          {hops.map((h, j) => (
            <span key={j} className="flex items-center gap-1.5">
              {j > 0 && <ArrowRight size={14} className={clsx(h.health === 'healthy' ? 'text-slate-300' : 'text-rose-400')} />}
              <span
                title={h.names.join(' → ')}
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium',
                  h.health === 'healthy' ? 'border-slate-200 bg-white text-slate-700' : h.health === 'degraded' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-rose-300 bg-rose-50 text-rose-800',
                )}
              >
                <span className="h-2 w-2 rounded-sm" style={{ background: TOOLS[h.tool].color }} />
                {TOOLS[h.tool].label}
                {h.health !== 'healthy' && <span className={clsx('h-1.5 w-1.5 rounded-full', HEALTH[h.health].dot)} />}
              </span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
