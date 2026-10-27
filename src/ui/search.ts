import type { ContextItem } from '../assistant/context';
import type { ConversionRow } from '../insights/conversions';
import type { Problem } from '../insights/problems';
import type { Entity } from '../model/schema';
import { KIND_LABEL, TOOLS, entityPath } from './meta';

// One index for the ⌘K palette and the assistant's context picker: everything you can jump to
// or hand to the assistant.

export interface SearchItem {
  id: string;
  group: 'Problems' | 'Conversions' | 'Tags, events & conversions' | 'Pages';
  label: string;
  sublabel: string;
  to?: string;
  context?: ContextItem;
  /** Colour swatch (tool colour) shown next to the label. */
  color?: string;
  haystack: string;
}

const PAGES: [string, string, string][] = [
  ['Overview', '/', 'home conversions health'],
  ['Problems', '/problems', 'issues anomalies fixes queue'],
  ['Stack map', '/map', 'graph diagram'],
  ['Relationships', '/relationships', 'links dependencies matrix'],
  ['Scans & history', '/scans', 'sources change log history'],
];

const SEARCHABLE_KINDS = new Set<Entity['kind']>([
  'datalayer_event',
  'gtm_tag',
  'gtm_trigger',
  'gtm_variable',
  'gtm_client',
  'ga4_event',
  'ga4_custom_dimension',
  'gads_conversion_action',
  'gads_campaign',
  'meta_event',
  'meta_custom_conversion',
  'meta_campaign',
]);

export function buildSearchItems(problems: Problem[], entities: Entity[], grid: ConversionRow[]): SearchItem[] {
  const items: SearchItem[] = [];
  for (const [label, to, kw] of PAGES) items.push({ id: `page:${to}`, group: 'Pages', label, sublabel: 'Page', to, haystack: `${label} ${kw}`.toLowerCase() });
  for (const p of problems)
    if (p.status !== 'fixed')
      items.push({
        id: `problem:${p.id}`,
        group: 'Problems',
        label: p.headline,
        sublabel: `${p.ruleId ?? 'Data'} · ${p.tools.map((t) => TOOLS[t].short).join(', ')}`,
        to: `/problems/${encodeURIComponent(p.id)}`,
        context: { kind: 'problem', id: p.id },
        haystack: `${p.headline} ${p.technicalTitle} ${p.ruleId ?? ''}`.toLowerCase(),
      });
  for (const r of grid)
    items.push({
      id: `conversion:${r.conversion.id}`,
      group: 'Conversions',
      label: r.conversion.label,
      sublabel: 'Conversion · all platforms',
      to: `/?conversion=${r.conversion.id}`,
      context: { kind: 'conversion', id: r.conversion.id },
      haystack: `${r.conversion.label} ${r.conversion.description} conversion`.toLowerCase(),
    });
  for (const e of entities)
    if (SEARCHABLE_KINDS.has(e.kind))
      items.push({
        id: `entity:${e.id}`,
        group: 'Tags, events & conversions',
        label: e.name,
        sublabel: `${TOOLS[e.tool].label} · ${KIND_LABEL[e.kind]}`,
        to: entityPath(e.tool, e.id),
        context: { kind: 'entity', id: e.id },
        color: TOOLS[e.tool].color,
        haystack: `${e.name} ${e.externalId} ${TOOLS[e.tool].label} ${KIND_LABEL[e.kind]}`.toLowerCase(),
      });
  return items;
}

const GROUP_ORDER: SearchItem['group'][] = ['Pages', 'Problems', 'Conversions', 'Tags, events & conversions'];

/**
 * Every query word must appear. Results stay grouped (so headers don't repeat); the group holding
 * the best match comes first, so "@lead" finds the Meta "Lead" event before problems mentioning leads.
 */
export function searchItems(items: SearchItem[], query: string, limit = 30): SearchItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items.filter((i) => i.group !== 'Tags, events & conversions').slice(0, limit);
  const words = q.split(/\s+/);
  const scored = items
    .filter((i) => words.every((w) => i.haystack.includes(w)))
    .map((i) => {
      const label = i.label.toLowerCase();
      return { i, score: label === q ? 0 : label.startsWith(q) ? 1 : label.includes(q) ? 2 : 3 };
    });
  const best = new Map<string, number>();
  for (const x of scored) best.set(x.i.group, Math.min(best.get(x.i.group) ?? 9, x.score));
  return scored
    .sort((a, b) => best.get(a.i.group)! - best.get(b.i.group)! || GROUP_ORDER.indexOf(a.i.group) - GROUP_ORDER.indexOf(b.i.group) || a.score - b.score)
    .slice(0, limit)
    .map((x) => x.i);
}
