import type { Entity, EventKey, Link, LinkType, ToolId } from '../model/schema';

// Data-flow direction per link type. 'forward': from is upstream of to. 'reverse': to is upstream of
// from (the link points at a dependency). 'lateral': related, not part of the flow.
export const LINK_FLOW: Record<LinkType, 'forward' | 'reverse' | 'lateral'> = {
  sends_to: 'forward',
  routes_to: 'forward',
  produces_event: 'forward',
  imports: 'forward',
  feeds_custom_conversion: 'forward',
  fires_on: 'reverse',
  listens_for: 'reverse',
  optimises_for: 'reverse',
  uses_variable: 'lateral',
  deduplicates_with: 'lateral',
  product_link: 'lateral',
};

export const LINK_LABELS: Record<LinkType, string> = {
  sends_to: 'sends to',
  routes_to: 'routes to',
  produces_event: 'records event',
  imports: 'imported into',
  feeds_custom_conversion: 'feeds custom conversion',
  fires_on: 'fires on',
  listens_for: 'listens for',
  optimises_for: 'optimises for',
  uses_variable: 'uses variable',
  deduplicates_with: 'deduplicated with',
  product_link: 'linked with',
};

// Labels for reading a link in data-flow order (source → destination), used in lineage chains.
export const FLOW_LABELS: Record<LinkType, string> = {
  sends_to: 'sends to',
  routes_to: 'routes to',
  produces_event: 'records',
  imports: 'imported into',
  feeds_custom_conversion: 'feeds',
  fires_on: 'fires',
  listens_for: 'activates',
  optimises_for: 'optimises',
  uses_variable: 'used by',
  deduplicates_with: 'deduplicated with',
  product_link: 'linked with',
};

const VAR_REF = /\{\{([^}]+)\}\}/g;

function collectVarRefs(value: unknown, out: Set<string>) {
  if (typeof value === 'string') for (const m of value.matchAll(VAR_REF)) out.add(m[1]);
  else if (Array.isArray(value)) value.forEach((v) => collectVarRefs(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectVarRefs(v, out));
}

const cfg = (e: Entity) => e.config as Record<string, any>;

/**
 * Infer every link from entity config. Runs on every scan, so applying a fix that changes config
 * (e.g. adds an event_id) genuinely changes the graph. May add derived entities, such as a
 * dataLayer event a trigger listens for that isn't in the site's tracking plan.
 */
export function inferLinks(input: Entity[]): { entities: Entity[]; links: Link[] } {
  const entities = [...input];
  const byId = new Map(entities.map((e) => [e.id, e]));
  const links: Link[] = [];
  const add = (type: LinkType, from: string, to: string, evidence: string[], eventKey?: EventKey, inferred = false) => {
    if (!byId.has(from) || !byId.has(to)) return;
    links.push({ id: `${type}|${from}|${to}`, type, from, to, health: 'healthy', evidence, inferred, eventKey });
  };
  const of = (kind: Entity['kind'], tool?: ToolId) => entities.filter((e) => e.kind === kind && (!tool || e.tool === tool));

  // GTM: tags → triggers, triggers → dataLayer events, anything → variables
  for (const tool of ['gtm_web', 'gtm_server'] as const) {
    const vars = new Map(of('gtm_variable', tool).map((v) => [v.name, v]));
    for (const tag of of('gtm_tag', tool)) {
      for (const trig of (cfg(tag).firingTriggerIds as string[]) ?? []) add('fires_on', tag.id, trig, [`Firing trigger: ${byId.get(trig)?.name ?? trig}`]);
    }
    for (const e of [...of('gtm_tag', tool), ...of('gtm_trigger', tool), ...of('gtm_variable', tool)]) {
      const refs = new Set<string>();
      collectVarRefs(e.config, refs);
      for (const r of refs) {
        const v = vars.get(r);
        if (v && v.id !== e.id) add('uses_variable', e.id, v.id, [`References {{${r}}}`]);
      }
    }
  }
  for (const trig of of('gtm_trigger', 'gtm_web')) {
    const name = cfg(trig).customEventName as string | undefined;
    if (!name) continue;
    const dlId = `site:dl:${name}`;
    if (!byId.has(dlId)) {
      const derived: Entity = {
        id: dlId,
        tool: 'site',
        kind: 'datalayer_event',
        externalId: name,
        name,
        status: 'active',
        config: { description: 'Referenced by a GTM trigger but not in the site tracking plan', params: '', inTrackingPlan: false },
        health: 'unknown',
        sourceRef: { snapshotId: 'derived', path: trig.id },
      };
      entities.push(derived);
      byId.set(dlId, derived);
    }
    add('listens_for', trig.id, dlId, [`Custom event equals "${name}"`]);
  }

  // Web Google tags → server container (via server_container_url) or straight to GA4
  const streams = of('ga4_stream');
  const serverContainer = of('gtm_container', 'gtm_server')[0];
  const serverUrl = serverContainer ? (cfg(serverContainer).taggingServerUrl as string) : '';
  const ga4Clients = of('gtm_client', 'gtm_server').filter((c) => cfg(c).clientType === 'GA4');
  const webTags = of('gtm_tag', 'gtm_web');
  const googleTags = webTags.filter((t) => cfg(t).tagType === 'google_tag');
  for (const tag of webTags.filter((t) => ['google_tag', 'ga4_event'].includes(cfg(t).tagType))) {
    const mid = cfg(tag).measurementId as string;
    const gt = cfg(tag).tagType === 'google_tag' ? tag : googleTags.find((g) => cfg(g).measurementId === mid);
    const transport = gt ? (cfg(gt).serverContainerUrl as string) : '';
    const eventName = cfg(tag).tagType === 'google_tag' ? 'page_view' : (cfg(tag).eventName as string);
    const key: EventKey = { ns: 'ga4', name: eventName };
    if (transport && transport === serverUrl) {
      for (const c of ga4Clients) add('sends_to', tag.id, c.id, [`server_container_url = ${transport}`, `GA4 event "${eventName}"`], key);
    } else {
      for (const s of streams.filter((s) => cfg(s).measurementId === mid)) add('sends_to', tag.id, s.id, [`Measurement ID ${mid} (direct, bypasses server)`], key);
    }
  }

  // Server: clients → triggers that claim on client name (and optionally event name)
  for (const trig of of('gtm_trigger', 'gtm_server')) {
    const client = ga4Clients.find((c) => c.name === cfg(trig).clientName);
    if (!client) continue;
    const ev = cfg(trig).eventName as string | undefined;
    add('routes_to', client.id, trig.id, [`Client Name equals ${client.name}`, ...(ev ? [`Event Name equals ${ev}`] : [])], ev ? { ns: 'ga4', name: ev } : undefined);
  }
  for (const tag of of('gtm_tag', 'gtm_server').filter((t) => cfg(t).tagType === 'ga4_server')) {
    for (const s of streams.filter((s) => cfg(s).measurementId === cfg(tag).measurementId)) add('sends_to', tag.id, s.id, [`Measurement ID ${cfg(tag).measurementId}`]);
  }

  // GA4 stream → events, events → Google Ads imports
  for (const s of streams) for (const ev of of('ga4_event')) add('produces_event', s.id, ev.id, [`Event "${ev.name}" recorded`], { ns: 'ga4', name: ev.name });
  for (const action of of('gads_conversion_action').filter((a) => cfg(a).source === 'GOOGLE_ANALYTICS_4_CUSTOM')) {
    const ev = byId.get(`ga4:event:${cfg(action).ga4EventName}`);
    if (ev) add('imports', ev.id, action.id, [`Imports GA4 event "${ev.name}" from property ${cfg(action).ga4PropertyId}`]);
  }

  // Web Google Ads tags → conversion actions (conversion ID + label)
  for (const tag of webTags.filter((t) => cfg(t).tagType === 'ads_conversion')) {
    for (const a of of('gads_conversion_action')) {
      if (cfg(a).conversionLabel && cfg(a).conversionLabel === cfg(tag).conversionLabel && cfg(a).conversionId === cfg(tag).conversionId) {
        add('sends_to', tag.id, a.id, [`send_to AW-${cfg(tag).conversionId}/${cfg(tag).conversionLabel}`]);
      }
    }
  }
  const adsAccount = of('gads_account')[0];
  for (const tag of webTags.filter((t) => cfg(t).tagType === 'conversion_linker')) {
    if (adsAccount) add('sends_to', tag.id, adsAccount.id, ['Stores click IDs (gclid, gbraid, wbraid) in first-party cookies']);
  }

  // Meta: Pixel (web) and CAPI (server) tags → events; deduplication pairs
  const dataset = of('meta_dataset')[0];
  const metaEvents = new Map(of('meta_event').map((e) => [e.name, e]));
  const pixelTags = webTags.filter((t) => cfg(t).tagType === 'meta_pixel');
  const capiTags = of('gtm_tag', 'gtm_server').filter((t) => cfg(t).tagType === 'meta_capi');
  for (const tag of [...pixelTags, ...capiTags]) {
    const ev = metaEvents.get(cfg(tag).eventName);
    const sameDataset = dataset && cfg(tag).pixelId === dataset.externalId;
    if (ev && sameDataset) {
      add('sends_to', tag.id, ev.id, [`${cfg(tag).tagType === 'meta_pixel' ? 'Pixel (browser)' : 'Conversions API (server)'} event "${ev.name}"`, `Dataset ${dataset.externalId}`], {
        ns: 'meta',
        name: ev.name,
      });
    }
  }
  for (const p of pixelTags) {
    for (const c of capiTags.filter((c) => cfg(c).eventName === cfg(p).eventName)) {
      add('deduplicates_with', p.id, c.id, [`Pixel event_id: ${cfg(p).eventId || '(none)'}`, `CAPI event_id: ${cfg(c).eventId || '(none)'}`]);
    }
  }
  for (const cc of of('meta_custom_conversion')) {
    const ev = metaEvents.get(cfg(cc).eventName);
    if (ev) add('feeds_custom_conversion', ev.id, cc.id, [`Rule: event = ${ev.name}${cfg(cc).ruleConditions ? `; ${cfg(cc).ruleConditions}` : ''}`]);
  }

  // Campaigns → what they optimise for
  for (const cp of of('gads_campaign')) for (const a of (cfg(cp).conversionGoalIds as string[]) ?? []) add('optimises_for', cp.id, a, ['Campaign conversion goal']);
  for (const cp of of('meta_campaign')) {
    if (cfg(cp).customConversionId) add('optimises_for', cp.id, cfg(cp).customConversionId, ['Ad set optimisation: custom conversion']);
    const ev = metaEvents.get(cfg(cp).optimisationEvent);
    if (ev) add('optimises_for', cp.id, ev.id, [`Ad set optimisation: ${ev.name}`]);
  }

  // GA4 ⇄ Google Ads product link
  for (const l of of('ga4_link')) {
    const prop = of('ga4_property')[0];
    if (adsAccount && prop && cfg(l).customerId === adsAccount.externalId) {
      add('product_link', prop.id, adsAccount.id, [`GA4 → Google Ads link`, `Personalised advertising: ${cfg(l).adsPersonalizationEnabled ? 'on' : 'off'}`]);
    }
  }

  return { entities, links };
}

export interface LineagePath {
  steps: { entityId: string; linkId?: string }[]; // ordered upstream-most → target (or target → downstream-most)
}

export class Graph {
  readonly byId: Map<string, Entity>;
  readonly linkById: Map<string, Link>;
  private out = new Map<string, Link[]>();
  private in = new Map<string, Link[]>();

  constructor(
    readonly entities: Entity[],
    readonly links: Link[],
  ) {
    this.byId = new Map(entities.map((e) => [e.id, e]));
    this.linkById = new Map(links.map((l) => [l.id, l]));
    for (const l of links) {
      (this.out.get(l.from) ?? this.out.set(l.from, []).get(l.from)!).push(l);
      (this.in.get(l.to) ?? this.in.set(l.to, []).get(l.to)!).push(l);
    }
  }

  linksOf(id: string): Link[] {
    return [...(this.out.get(id) ?? []), ...(this.in.get(id) ?? [])];
  }

  /** Neighbours one step upstream or downstream in data-flow terms, with the link that connects them. */
  private step(id: string, dir: 'up' | 'down'): { next: string; link: Link }[] {
    const res: { next: string; link: Link }[] = [];
    for (const l of this.out.get(id) ?? []) {
      const f = LINK_FLOW[l.type];
      if ((f === 'forward' && dir === 'down') || (f === 'reverse' && dir === 'up')) res.push({ next: l.to, link: l });
    }
    for (const l of this.in.get(id) ?? []) {
      const f = LINK_FLOW[l.type];
      if ((f === 'forward' && dir === 'up') || (f === 'reverse' && dir === 'down')) res.push({ next: l.from, link: l });
    }
    return res;
  }

  /**
   * All paths from the entity upstream to its sources (or downstream to its sinks).
   * Event-aware: once a path passes a link carrying an eventKey, it only follows links for the
   * same event in that namespace, so a server client doesn't connect every web tag to every server tag.
   */
  lineage(id: string, dir: 'up' | 'down', maxPaths = 40): LineagePath[] {
    const paths: LineagePath[] = [];
    const walk = (cur: string, trail: { entityId: string; linkId?: string }[], seen: Set<string>, constraint: Partial<Record<EventKey['ns'], string>>) => {
      if (paths.length >= maxPaths) return;
      const nexts = this.step(cur, dir).filter(({ next, link }) => {
        if (seen.has(next)) return false;
        const k = link.eventKey;
        return !k || !constraint[k.ns] || constraint[k.ns] === k.name;
      });
      if (nexts.length === 0) {
        if (trail.length > 1) paths.push({ steps: dir === 'up' ? [...trail].reverse() : trail });
        return;
      }
      for (const { next, link } of nexts) {
        const c = link.eventKey ? { ...constraint, [link.eventKey.ns]: link.eventKey.name } : constraint;
        // On the way up, the link belongs to the step below the new node; on the way down, to the new node.
        const newTrail = dir === 'up'
          ? [...trail.slice(0, -1), { ...trail[trail.length - 1], linkId: link.id }, { entityId: next }]
          : [...trail, { entityId: next, linkId: link.id }];
        walk(next, newTrail, new Set([...seen, next]), c);
      }
    };
    walk(id, [{ entityId: id }], new Set([id]), {});
    return paths;
  }

  /** Every entity reachable upstream/downstream (deduplicated), for impact analysis and attribution. */
  reachable(id: string, dir: 'up' | 'down'): Set<string> {
    const out = new Set<string>();
    for (const p of this.lineage(id, dir, 200)) for (const s of p.steps) if (s.entityId !== id) out.add(s.entityId);
    return out;
  }

  related(id: string): Link[] {
    return this.linksOf(id).filter((l) => LINK_FLOW[l.type] === 'lateral');
  }
}
