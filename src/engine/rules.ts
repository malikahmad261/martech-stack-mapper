import type { ChangeEvent, Entity, Fix, IssueCategory, Link, Severity, Tool, ToolId } from '../model/schema';
import type { Graph } from './graph';
import type { MetricIndex } from './metrics';

export interface RuleContext {
  graph: Graph;
  tools: Map<ToolId, Tool>;
  metrics: MetricIndex;
  changeEvents: ChangeEvent[];
  asOf: string; // last day of data, YYYY-MM-DD
}

export type FixDraft = Pick<Fix, 'title' | 'rationale' | 'risk' | 'manualSteps' | 'verifyAfter'> & {
  ops: { entityId: string; field: string; op?: 'set' | 'add' | 'remove'; to: unknown }[];
};

export interface Finding {
  entityIds: string[]; // first is the primary entity (used for the issue ID)
  linkIds: string[];
  title: string;
  evidence: Record<string, unknown>;
  diagnosis: string;
  fix?: FixDraft;
  fixedBy?: { ruleId: string; entityId: string }; // resolved by another issue's fix
}

export interface Rule {
  id: string;
  category: IssueCategory;
  severity: Severity;
  name: string;
  dataBased: boolean; // can only be confirmed fixed once new data arrives
  check: (ctx: RuleContext) => Finding[];
}

const cfg = (e: Entity) => e.config as Record<string, any>;
const of = (ctx: RuleContext, kind: Entity['kind'], tool?: ToolId) => ctx.graph.entities.filter((e) => e.kind === kind && (!tool || e.tool === tool));
const linksWhere = (ctx: RuleContext, pred: (l: Link) => boolean) => ctx.graph.links.filter(pred).map((l) => l.id);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const LEAD_CATEGORIES = ['SUBMIT_LEAD_FORM', 'PHONE_CALL_LEAD', 'BOOK_APPOINTMENT', 'QUALIFIED_LEAD', 'SIGNUP'];
const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);

/** Daily conversion series for a conversion endpoint (Ads action, Meta event or GA4 event). */
function conversionSeries(ctx: RuleContext, e: Entity): number[] | null {
  const m = ctx.metrics;
  if (e.kind === 'gads_conversion_action') return m.get(e.id, 'conversions');
  if (e.kind === 'meta_event') return m.sum([m.get(e.id, 'events_browser'), m.get(e.id, 'events_server')]);
  if (e.kind === 'ga4_event') return m.get(e.id, 'events');
  return null;
}

function trafficSeries(ctx: RuleContext, tool: ToolId): number[] {
  const m = ctx.metrics;
  if (tool === 'google_ads') return m.sum(of(ctx, 'gads_campaign').map((c) => m.get(c.id, 'clicks')));
  if (tool === 'meta') return m.sum(of(ctx, 'meta_campaign').map((c) => m.get(c.id, 'clicks')));
  const stream = of(ctx, 'ga4_stream')[0];
  return m.sum(m.dimensionValues(stream.id, 'sessions', 'channel').map((ch) => m.get(stream.id, 'sessions', { channel: ch })));
}

/** Last-7-day total vs. the 7-day equivalent of the 4 weeks before that. */
function collapse(ctx: RuleContext, series: number[]) {
  const recent = ctx.metrics.last(series, 7);
  const baseline = ctx.metrics.avg(series, 28, 7) * 7;
  return { recent, baseline, ratio: baseline > 0 ? recent / baseline : 1 };
}

const fmt = (n: number) => (Math.abs(n) >= 100 ? Math.round(n).toLocaleString('en-US') : String(Math.round(n * 10) / 10));

export const RULES: Rule[] = [
  {
    id: 'CT-01',
    category: 'conversion_tracking',
    severity: 'critical',
    name: 'GA4 key event expected by a Google Ads import is missing or not a key event',
    dataBased: false,
    check(ctx) {
      const out: Finding[] = [];
      for (const a of of(ctx, 'gads_conversion_action').filter((a) => cfg(a).source === 'GOOGLE_ANALYTICS_4_CUSTOM' && a.status === 'active')) {
        const ev = ctx.graph.byId.get(`ga4:event:${cfg(a).ga4EventName}`);
        if (ev && cfg(ev).isKeyEvent) continue;
        const removed = ctx.changeEvents.filter((c) => ev && c.entityIds.includes(ev.id)).pop();
        const conv = collapse(ctx, ctx.metrics.get(a.id, 'conversions'));
        out.push({
          entityIds: [a.id, ...(ev ? [ev.id] : [])],
          linkIds: linksWhere(ctx, (l) => l.type === 'imports' && l.to === a.id),
          title: `"${a.name}" imports GA4 "${cfg(a).ga4EventName}", which is not a key event`,
          evidence: {
            'Conversion action': a.name,
            'Primary for bidding': cfg(a).primaryForGoal ? 'Yes' : 'No',
            'GA4 event': cfg(a).ga4EventName,
            'GA4 event still recorded (28d)': ev ? fmt(cfg(ev).eventCount28d) : 'Not found',
            'Marked as key event': 'No',
            'Ads conversions, last 7 days': fmt(conv.recent),
            'Ads conversions, prior 7-day average': fmt(conv.baseline),
            ...(removed ? { 'Related change': `${removed.summary} — ${removed.actor}, ${removed.at.slice(0, 10)}` } : {}),
          },
          diagnosis:
            `Google Ads can only import GA4 events that are marked as key events. "${cfg(a).ga4EventName}" is still being recorded in GA4` +
            `${ev ? ` (${fmt(cfg(ev).eventCount28d)} events in the last 28 days)` : ''}, but it is no longer a key event${removed ? ` since ${removed.at.slice(0, 10)}` : ''}, ` +
            `so "${a.name}" has stopped receiving conversions. Because it is a primary conversion, Smart Bidding on every campaign that optimises for it is now ` +
            `bidding with a missing signal and will under-value consultation traffic.`,
          fix: ev
            ? {
                title: `Mark "${ev.name}" as a key event in GA4`,
                rationale: `Re-create the key event so the Google Ads import starts receiving conversions again.`,
                risk: 'low',
                manualSteps: [`GA4 → Admin → Events → toggle "Mark as key event" for ${ev.name}`, 'Counting method: Once per event'],
                verifyAfter: [`Conversions for "${a.name}" reappear in Google Ads within 24–48 hours`, 'Conversions imported before the gap are not back-filled'],
                ops: [
                  { entityId: ev.id, field: 'isKeyEvent', to: true },
                  { entityId: ev.id, field: 'countingMethod', to: 'ONCE_PER_EVENT' },
                ],
              }
            : undefined,
        });
      }
      return out;
    },
  },
  {
    id: 'CT-02',
    category: 'conversion_tracking',
    severity: 'critical',
    name: 'Conversions collapsed while traffic stayed stable',
    dataBased: true,
    check(ctx) {
      const out: Finding[] = [];
      const g = ctx.graph;
      for (const trig of of(ctx, 'gtm_trigger', 'gtm_web').filter((t) => cfg(t).customEventName)) {
        const endpoints = [...g.reachable(trig.id, 'down')]
          .map((id) => g.byId.get(id)!)
          .filter(
            (e) =>
              // GA4 imports of non-key events are CT-01's problem, not a tracking collapse.
              (e.kind === 'gads_conversion_action' && cfg(e).source === 'WEBPAGE') ||
              (e.kind === 'gads_conversion_action' && cfg(e).source === 'GOOGLE_ANALYTICS_4_CUSTOM' && cfg(g.byId.get(`ga4:event:${cfg(e).ga4EventName}`) ?? ({ config: {} } as Entity)).isKeyEvent) ||
              e.kind === 'meta_event' ||
              (e.kind === 'ga4_event' && cfg(e).isKeyEvent),
          );
        const collapsed = endpoints
          .map((e) => ({ e, c: collapse(ctx, conversionSeries(ctx, e)!), traffic: collapse(ctx, trafficSeries(ctx, e.tool)) }))
          .filter((x) => x.c.baseline >= 5 && x.c.ratio <= 0.3 && Math.abs(x.traffic.ratio - 1) <= 0.3);
        if (collapsed.length === 0 || collapsed.length < endpoints.length / 2) continue;
        const change = ctx.changeEvents.filter((c) => c.entityIds.includes(trig.id)).pop();
        const before = (change?.before as { field: string; value: unknown }[] | undefined)?.find((b) => b.field === 'customEventName')?.value as string | undefined;
        const listened = cfg(trig).customEventName as string;
        const dl = g.byId.get(`site:dl:${listened}`);
        const inPlan = dl ? cfg(dl).inTrackingPlan : false;
        out.push({
          entityIds: [trig.id, ...collapsed.map((x) => x.e.id)],
          linkIds: linksWhere(ctx, (l) => l.type === 'listens_for' && l.from === trig.id),
          title: `Conversions fed by "${trig.name}" dropped ${pct(1 - Math.max(...collapsed.map((x) => x.c.ratio)))}+ while traffic held`,
          evidence: {
            'Trigger listens for': listened,
            'Event in site tracking plan': inPlan ? 'Yes' : 'No — the site does not push this event',
            ...Object.fromEntries(collapsed.map((x) => [`${x.e.name} (${x.e.tool === 'google_ads' ? 'Google Ads' : x.e.tool === 'meta' ? 'Meta' : 'GA4'})`, `${fmt(x.c.recent)} last 7d vs ${fmt(x.c.baseline)} expected`])),
            ...(change ? { 'Related change': `${change.summary} — ${change.actor}, ${change.at.slice(0, 10)}` } : {}),
          },
          diagnosis:
            `Every conversion downstream of "${trig.name}" fell by roughly 90% at the same time, while clicks and sessions stayed within normal range — so this is ` +
            `a tracking break, not a performance drop. ${change ? `${change.summary.replace('Published ', 'GTM ')} changed this trigger to listen for "${listened}"` : `The trigger listens for "${listened}"`}` +
            `${inPlan ? '.' : `, but the website still pushes "${before ?? 'a different event'}" to the dataLayer, so the trigger rarely fires.`} ` +
            `Google Ads, GA4 and Meta are all under-reporting leads, and bidding on campaigns that optimise for these conversions is affected.`,
          fix: before
            ? {
                title: `Point "${trig.name}" back at the "${before}" dataLayer event`,
                rationale: `Restore the event name the site actually pushes. If the new form vendor will push "${listened}" later, use a regex that matches both.`,
                risk: 'medium',
                manualSteps: ['GTM Web → Triggers → ' + trig.name + ` → Event name: ${before}`, 'Preview and submit a test quote before publishing'],
                verifyAfter: ['Test submission fires GA4, Google Ads and Meta tags in GTM Preview', 'Daily conversions return to baseline from the next day'],
                ops: [{ entityId: trig.id, field: 'customEventName', to: before }],
              }
            : undefined,
        });
      }
      return out;
    },
  },
  {
    id: 'CT-03',
    category: 'conversion_tracking',
    severity: 'medium',
    name: 'Lead conversion counts every conversion instead of one per click',
    dataBased: false,
    check(ctx) {
      return of(ctx, 'gads_conversion_action')
        .filter((a) => LEAD_CATEGORIES.includes(cfg(a).category) && cfg(a).countingType === 'MANY_PER_CLICK')
        .map((a) => ({
          entityIds: [a.id],
          linkIds: linksWhere(ctx, (l) => l.to === a.id && l.type !== 'optimises_for'),
          title: `"${a.name}" counts every conversion per click`,
          evidence: { 'Conversion action': a.name, Category: cfg(a).category, 'Counting': 'Every', 'Recommended': 'One', 'Primary for bidding': cfg(a).primaryForGoal ? 'Yes' : 'No' },
          diagnosis:
            `"${a.name}" is a lead action but counts every conversion after an ad click. A visitor who taps the phone number three times is reported as three leads, ` +
            `which inflates lead counts and cost-per-lead reporting. Google recommends "One" for lead actions.`,
          fix: {
            title: `Count one conversion per click for "${a.name}"`,
            rationale: 'Lead actions should count one conversion per ad interaction.',
            risk: 'low',
            manualSteps: [`Google Ads → Goals → Conversions → ${a.name} → Count: One`],
            verifyAfter: ['Conversion counts drop to unique leads from the change date onwards'],
            ops: [{ entityId: a.id, field: 'countingType', to: 'ONE_PER_CLICK' }],
          },
        }));
    },
  },
  {
    id: 'CT-04',
    category: 'conversion_tracking',
    severity: 'high',
    name: 'The same lead is counted twice as a primary conversion',
    dataBased: false,
    check(ctx) {
      const out: Finding[] = [];
      const g = ctx.graph;
      const primaries = of(ctx, 'gads_conversion_action').filter((a) => cfg(a).primaryForGoal && a.status === 'active' && cfg(a).source !== 'UPLOAD_CLICKS');
      const dlOf = (a: Entity) => new Set([...g.reachable(a.id, 'up')].filter((id) => id.startsWith('site:dl:')));
      for (let i = 0; i < primaries.length; i++) {
        for (let j = i + 1; j < primaries.length; j++) {
          const [a, b] = [primaries[i], primaries[j]];
          if (cfg(a).category !== cfg(b).category) continue;
          const shared = [...dlOf(a)].filter((x) => dlOf(b).has(x));
          if (!shared.length) continue;
          const ga4 = [a, b].find((x) => cfg(x).source === 'GOOGLE_ANALYTICS_4_CUSTOM') ?? b;
          const keep = ga4 === a ? b : a;
          out.push({
            entityIds: [ga4.id, keep.id],
            linkIds: linksWhere(ctx, (l) => (l.to === a.id || l.to === b.id) && l.type !== 'optimises_for'),
            title: `"${keep.name}" and "${ga4.name}" both count the same lead as primary`,
            evidence: {
              'Action 1': `${keep.name} (${cfg(keep).source === 'WEBPAGE' ? 'Google Ads tag' : cfg(keep).source})`,
              'Action 2': `${ga4.name} (GA4 import)`,
              'Shared source event': shared.map((s) => g.byId.get(s)!.name).join(', '),
              'Both primary': 'Yes',
            },
            diagnosis:
              `Both actions are fired by the same form submission and both are set as primary, so every quote request is counted twice in the "Conversions" column. ` +
              `Smart Bidding sees double the real conversion volume and value, which can push bids too high. Keep one as primary (the Google Ads tag supports ` +
              `enhanced conversions and has no import delay) and make the other secondary for reporting.`,
            fix: {
              title: `Make "${ga4.name}" a secondary conversion`,
              rationale: `Keep "${keep.name}" as the single primary conversion for quote requests.`,
              risk: 'medium',
              manualSteps: [`Google Ads → Goals → Conversions → ${ga4.name} → Action optimisation: Secondary`],
              verifyAfter: ['Conversions column drops to roughly half for quote requests', 'Watch CPA targets for 1–2 weeks while bidding recalibrates'],
              ops: [{ entityId: ga4.id, field: 'primaryForGoal', to: false }],
            },
          });
        }
      }
      return out;
    },
  },
  {
    id: 'CT-05',
    category: 'conversion_tracking',
    severity: 'medium',
    name: 'Conversion has no value or currency',
    dataBased: false,
    check(ctx) {
      return of(ctx, 'gads_conversion_action')
        .filter((a) => cfg(a).primaryForGoal && !cfg(a).defaultValue && cfg(a).source !== 'UPLOAD_CLICKS')
        .map((a) => ({
          entityIds: [a.id],
          linkIds: [],
          title: `"${a.name}" has no conversion value`,
          evidence: { 'Default value': cfg(a).defaultValue ?? 0 },
          diagnosis: `"${a.name}" sends no value, so value-based bidding treats every lead as worth nothing.`,
        }));
    },
  },
  {
    id: 'CT-06',
    category: 'conversion_tracking',
    severity: 'high',
    name: 'Conversion tag fires on a page view instead of a confirmed submission',
    dataBased: false,
    check(ctx) {
      const g = ctx.graph;
      return of(ctx, 'gtm_tag', 'gtm_web')
        .filter((t) => cfg(t).tagType === 'ads_conversion' || (cfg(t).tagType === 'meta_pixel' && cfg(t).eventName !== 'PageView'))
        .filter((t) => (cfg(t).firingTriggerIds as string[]).some((id) => cfg(g.byId.get(id) ?? ({ config: {} } as Entity)).triggerType === 'Page View'))
        .map((t) => ({
          entityIds: [t.id],
          linkIds: linksWhere(ctx, (l) => l.type === 'fires_on' && l.from === t.id),
          title: `"${t.name}" fires on a page view`,
          evidence: { Tag: t.name },
          diagnosis: `"${t.name}" fires when a page loads rather than when a form is confirmed, so it counts visits as conversions.`,
        }));
    },
  },
  {
    id: 'CT-07',
    category: 'conversion_tracking',
    severity: 'high',
    name: 'Offline conversion import has stopped',
    dataBased: true,
    check(ctx) {
      return of(ctx, 'gads_conversion_action')
        .filter((a) => cfg(a).source === 'UPLOAD_CLICKS' && cfg(a).offlineUpload)
        .filter((a) => daysBetween(cfg(a).offlineUpload.lastUploadAt.slice(0, 10), ctx.asOf) > 14 || cfg(a).offlineUpload.status === 'NEEDS_ATTENTION')
        .map((a) => {
          const u = cfg(a).offlineUpload;
          const days = daysBetween(u.lastUploadAt.slice(0, 10), ctx.asOf);
          return {
            entityIds: [a.id],
            linkIds: [],
            title: `No "${a.name}" uploads for ${days} days`,
            evidence: {
              'Conversion action': a.name,
              'Last upload': u.lastUploadAt,
              'Days since last upload': days,
              'Upload health': u.status.replaceAll('_', ' ').toLowerCase(),
              'Lifetime success rate': pct(u.successful / u.total),
              'Primary for bidding': cfg(a).primaryForGoal ? 'Yes' : 'No',
            },
            diagnosis:
              `"${a.name}" is imported from your CRM via the Google Ads API (click ID upload), and nothing has been uploaded since ${u.lastUploadAt.slice(0, 10)}. ` +
              `This is the most valuable signal in the account (default value $${cfg(a).defaultValue}) and is primary for bidding, so campaigns optimising ` +
              `towards qualified leads are now bidding on form fills only. The upload job or its credentials most likely failed — the CRM is outside this tool's view.`,
            fix: {
              title: `Restore the "${a.name}" offline upload`,
              rationale: 'The fix happens in the CRM / upload job, so this is a guided manual fix.',
              risk: 'low',
              manualSteps: [
                'Check the CRM → Google Ads upload job logs for errors since ' + u.lastUploadAt.slice(0, 10),
                'Re-authorise the Google Ads connection if the OAuth token has expired',
                'Re-upload missed qualified leads (clicks within the 90-day window are still accepted)',
              ],
              verifyAfter: ['Upload diagnostics in Google Ads show a successful import', 'Qualified Lead conversions appear for recent dates'],
              ops: [],
            },
          };
        });
    },
  },
  {
    id: 'MT-01',
    category: 'conversion_tracking',
    severity: 'high',
    name: 'Pixel and CAPI events are not deduplicated (missing event_id)',
    dataBased: false,
    check(ctx) {
      const g = ctx.graph;
      return g.links
        .filter((l) => l.type === 'deduplicates_with')
        .map((l) => ({ l, pixel: g.byId.get(l.from)!, capi: g.byId.get(l.to)! }))
        .filter(({ pixel, capi }) => !cfg(pixel).eventId || !cfg(capi).eventId)
        .map(({ l, pixel, capi }) => {
          const ev = g.byId.get(`meta:event:${cfg(pixel).eventName}`);
          const missing = !cfg(pixel).eventId ? pixel : capi;
          return {
            entityIds: [missing.id, ...(ev ? [ev.id] : []), missing === pixel ? capi.id : pixel.id],
            linkIds: [l.id, ...linksWhere(ctx, (x) => x.type === 'sends_to' && (x.from === pixel.id || x.from === capi.id))],
            title: `Meta "${cfg(pixel).eventName}" is double counted: ${missing === pixel ? 'Pixel' : 'CAPI'} sends no event_id`,
            evidence: {
              'Pixel tag (GTM Web)': `${pixel.name} — event_id: ${cfg(pixel).eventId || '(none)'}`,
              'CAPI tag (GTM Server)': `${capi.name} — event_id: ${cfg(capi).eventId || '(none)'}`,
              ...(ev
                ? {
                    'Browser events with dedup key': `${cfg(ev).dedupBrowserPct ?? 'n/a'}%`,
                    'Server events with dedup key': `${cfg(ev).dedupServerPct ?? 'n/a'}%`,
                    'Event coverage (server vs browser)': `${cfg(ev).eventCoveragePct ?? 'n/a'}%`,
                  }
                : {}),
            },
            diagnosis:
              `Meta removes duplicates only when the browser and server copies of an event share the same event_id. ` +
              `"${missing.name}" sends none, so every ${cfg(pixel).eventName} that reaches Meta through both the Pixel and the Conversions API is counted twice. ` +
              `Reported leads are inflated by roughly 80%, cost per lead looks better than it is, and the campaign optimises on duplicated signals.`,
            fix: {
              title: `Send event_id from "${missing.name}"`,
              rationale: `Use the same dataLayer event_id that the GA4 tag already forwards to the server, so both copies match.`,
              risk: 'low',
              manualSteps: [`GTM Web → Tags → ${missing.name} → Event ID: {{DLV – event_id}}`],
              verifyAfter: ['Events Manager → Lead → Event deduplication shows browser events with event_id near 100%', 'Reported Meta leads fall to roughly GA4 levels'],
              ops: [{ entityId: missing.id, field: 'eventId', to: missing.tool === 'gtm_web' ? '{{DLV – event_id}}' : '{{ED – event_id}}' }],
            },
          };
        });
    },
  },
  {
    id: 'MT-02',
    category: 'conversion_tracking',
    severity: 'medium',
    name: 'CAPI event has low event match quality',
    dataBased: false,
    check(ctx) {
      const g = ctx.graph;
      return of(ctx, 'gtm_tag', 'gtm_server')
        .filter((t) => cfg(t).tagType === 'meta_capi' && !cfg(t).userData.em && !cfg(t).userData.ph)
        .map((t) => {
          const ev = g.byId.get(`meta:event:${cfg(t).eventName}`);
          return {
            entityIds: [t.id, ...(ev ? [ev.id] : [])],
            linkIds: linksWhere(ctx, (l) => l.type === 'sends_to' && l.from === t.id),
            title: `"${t.name}" sends no hashed email or phone`,
            evidence: {
              'CAPI tag': t.name,
              'Event match quality': ev?.config.emq != null ? `${ev.config.emq} / 10` : 'n/a',
              'Email coverage': `${(ev?.config.matchKeyCoverage as Record<string, number>)?.email ?? 0}%`,
              'Phone coverage': `${(ev?.config.matchKeyCoverage as Record<string, number>)?.phone ?? 0}%`,
              'Available in event data': 'user_data.email_address, user_data.phone_number (from the GA4 tag)',
            },
            diagnosis:
              `The Conversions API tag only sends IP address and user agent, so Meta can match few ${cfg(t).eventName} events to people (EMQ ${ev?.config.emq ?? '?'}). ` +
              `The GA4 tag already forwards the form's email and phone to the server container as user_data, so they can be mapped to em and ph — the tag hashes them before sending.`,
            fix: {
              title: `Map email and phone in "${t.name}"`,
              rationale: 'Use the user-provided data the web GA4 tag already sends to the server container.',
              risk: 'low',
              manualSteps: [`GTM Server → Tags → ${t.name} → User Data → em, ph`],
              verifyAfter: ['Events Manager EMQ for this event rises above 6 within 48 hours'],
              ops: [
                { entityId: t.id, field: 'userData.em', to: '{{ED – user_data.email_address}}' },
                { entityId: t.id, field: 'userData.ph', to: '{{ED – user_data.phone_number}}' },
              ],
            },
          };
        });
    },
  },
  {
    id: 'MT-03',
    category: 'conversion_tracking',
    severity: 'medium',
    name: 'Event used for optimisation has no Conversions API coverage',
    dataBased: false,
    check(ctx) {
      const g = ctx.graph;
      return of(ctx, 'meta_event')
        .filter((e) => g.links.some((l) => l.type === 'optimises_for' && l.to === e.id))
        .filter((e) => !g.links.some((l) => l.type === 'sends_to' && l.to === e.id && g.byId.get(l.from)?.tool === 'gtm_server'))
        .map((e) => ({
          entityIds: [e.id],
          linkIds: [],
          title: `Optimisation event "${e.name}" has no server-side (CAPI) coverage`,
          evidence: { Event: e.name },
          diagnosis: `"${e.name}" is used for campaign optimisation but is only sent from the browser, so ad blockers and consent loss go unrecovered.`,
        }));
    },
  },
  {
    id: 'CK-01',
    category: 'cookies_click_ids',
    severity: 'high',
    name: 'Conversion Linker missing or not firing on all pages',
    dataBased: false,
    check(ctx) {
      const g = ctx.graph;
      const linkers = of(ctx, 'gtm_tag', 'gtm_web').filter((t) => cfg(t).tagType === 'conversion_linker');
      const allPages = of(ctx, 'gtm_trigger', 'gtm_web').find((t) => cfg(t).triggerType === 'Page View' && !cfg(t).conditions);
      return linkers
        .filter((t) => !(cfg(t).firingTriggerIds as string[]).some((id) => id === allPages?.id))
        .map((t) => {
          const triggers = (cfg(t).firingTriggerIds as string[]).map((id) => g.byId.get(id));
          return {
            entityIds: [t.id, ...triggers.filter(Boolean).map((x) => x!.id)],
            linkIds: linksWhere(ctx, (l) => (l.type === 'fires_on' || l.type === 'sends_to') && l.from === t.id),
            title: 'Conversion Linker only fires on landing pages',
            evidence: {
              Tag: t.name,
              'Fires on': triggers.map((x) => (x ? `${x.name}${cfg(x).conditions ? ` (${cfg(x).conditions})` : ''}` : 'missing trigger')).join(', '),
              'Should fire on': 'All Pages',
            },
            diagnosis:
              `The Conversion Linker stores the gclid / gbraid / wbraid click IDs in first-party cookies. It only fires on /lp/ and /offers/ pages, so visitors who arrive ` +
              `from ads on any other page (home page, sitelinks, Performance Max placements) have no click ID stored, and their conversions can't be attributed to the ad — ` +
              `especially in Safari, where Google relies on first-party cookies.`,
            fix: {
              title: 'Fire the Conversion Linker on All Pages',
              rationale: 'Click IDs must be captured on whichever page the visitor lands on.',
              risk: 'low',
              manualSteps: ['GTM Web → Tags → Ads – Conversion Linker → Triggering: All Pages'],
              verifyAfter: ['_gcl_aw cookie is set on a test visit to the home page with ?gclid=test'],
              ops: [{ entityId: t.id, field: 'firingTriggerIds', to: allPages ? [allPages.id] : [] }],
            },
          };
        });
    },
  },
  {
    id: 'CK-02',
    category: 'cookies_click_ids',
    severity: 'medium',
    name: 'Server container is not setting first-party cookies',
    dataBased: false,
    check(ctx) {
      return of(ctx, 'gtm_client', 'gtm_server')
        .filter((c) => cfg(c).clientType === 'GA4' && cfg(c).cookieManagement !== 'server')
        .map((c) => ({
          entityIds: [c.id],
          linkIds: [],
          title: `Client "${c.name}" uses JavaScript-managed cookies`,
          evidence: { 'Cookie management': cfg(c).cookieManagement },
          diagnosis: 'Server-managed (FPID) cookies last longer than JavaScript cookies in Safari and Firefox.',
        }));
    },
  },
  {
    id: 'CK-03',
    category: 'cookies_click_ids',
    severity: 'medium',
    name: 'fbc / fbp not passed to the Conversions API',
    dataBased: false,
    check(ctx) {
      const g = ctx.graph;
      const tags = of(ctx, 'gtm_tag', 'gtm_server').filter((t) => cfg(t).tagType === 'meta_capi' && (!cfg(t).userData.fbc || !cfg(t).userData.fbp));
      if (!tags.length) return [];
      const lead = g.byId.get('meta:event:Lead');
      return [
        {
          entityIds: tags.map((t) => t.id),
          linkIds: linksWhere(ctx, (l) => l.type === 'sends_to' && tags.some((t) => t.id === l.from)),
          title: `${tags.length} CAPI tags don't send the fbc / fbp cookies`,
          evidence: {
            'Tags affected': tags.map((t) => t.name).join(', '),
            'fbc coverage (Lead)': `${(lead?.config.matchKeyCoverage as Record<string, number>)?.fbc ?? 0}%`,
            'fbp coverage (Lead)': `${(lead?.config.matchKeyCoverage as Record<string, number>)?.fbp ?? 0}%`,
            'Available in event data': 'x-fb-ck-fbc, x-fb-ck-fbp',
          },
          diagnosis:
            `fbc holds the Meta click ID (fbclid) and fbp the browser ID. Without them, server events can't be tied to the ad click or matched with the Pixel's ` +
            `browser events, so attribution for server-only conversions (ad-blocked or consent-limited browsers) is lost. The GA4 client already exposes both cookies as event data.`,
          fix: {
            title: 'Map fbc and fbp in all CAPI tags',
            rationale: 'Pass the Meta cookies the GA4 client already forwards.',
            risk: 'low',
            manualSteps: tags.map((t) => `GTM Server → Tags → ${t.name} → User Data → fbc: {{ED – fbc}}, fbp: {{ED – fbp}}`),
            verifyAfter: ['Events Manager shows fbc/fbp coverage on server events within 48 hours'],
            ops: tags.flatMap((t) => [
              { entityId: t.id, field: 'userData.fbc', to: '{{ED – fbc}}' },
              { entityId: t.id, field: 'userData.fbp', to: '{{ED – fbp}}' },
            ]),
          },
        },
      ];
    },
  },
  {
    id: 'CN-01',
    category: 'consent',
    severity: 'critical',
    name: 'Consent Mode v2 defaults missing ad_user_data / ad_personalization',
    dataBased: false,
    check(ctx) {
      const tags = of(ctx, 'gtm_tag', 'gtm_web').filter((t) => cfg(t).tagType === 'consent_defaults');
      return tags
        .filter((t) => !cfg(t).consentDefaults.ad_user_data || !cfg(t).consentDefaults.ad_personalization)
        .map((t) => ({
          entityIds: [t.id],
          linkIds: [],
          title: 'Consent defaults are missing the Consent Mode v2 signals',
          evidence: {
            Tag: t.name,
            ad_storage: cfg(t).consentDefaults.ad_storage || '(not set)',
            analytics_storage: cfg(t).consentDefaults.analytics_storage || '(not set)',
            ad_user_data: cfg(t).consentDefaults.ad_user_data || '(not set)',
            ad_personalization: cfg(t).consentDefaults.ad_personalization || '(not set)',
          },
          diagnosis:
            `Consent Mode v2 requires ad_user_data and ad_personalization alongside ad_storage and analytics_storage. Without them, Google treats EEA/UK traffic ` +
            `as non-consented for ads purposes: remarketing audiences stop growing, enhanced conversions are not used, and modelled conversions are limited.`,
          fix: {
            title: 'Add ad_user_data and ad_personalization defaults',
            rationale: 'Default both to denied (they are updated to granted when the visitor accepts in the CMP).',
            risk: 'medium',
            manualSteps: ['GTM Web → Tags → Consent – Defaults (CMP) → add ad_user_data: denied, ad_personalization: denied', 'Confirm the CMP sends both signals on accept'],
            verifyAfter: ['Tag Assistant shows all four consent signals on page load', 'Google Ads → Consent mode diagnostics shows v2 signals within 7 days'],
            ops: [
              { entityId: t.id, field: 'consentDefaults.ad_user_data', to: 'denied' },
              { entityId: t.id, field: 'consentDefaults.ad_personalization', to: 'denied' },
            ],
          },
        }));
    },
  },
  {
    id: 'CN-02',
    category: 'consent',
    severity: 'high',
    name: 'Advertising tag fires without a consent check',
    dataBased: false,
    check(ctx) {
      const tags = of(ctx, 'gtm_tag', 'gtm_web').filter((t) => cfg(t).tagType === 'meta_pixel' && cfg(t).consent.status === 'notSet');
      if (!tags.length) return [];
      return [
        {
          entityIds: tags.map((t) => t.id),
          linkIds: linksWhere(ctx, (l) => l.type === 'sends_to' && tags.some((t) => t.id === l.from)),
          title: `${tags.length} Meta Pixel tags fire without requiring consent`,
          evidence: { 'Tags affected': tags.map((t) => t.name).join(', '), 'Consent setting': 'Not set', 'Built-in consent checks': 'None (custom template)' },
          diagnosis:
            `The Meta Pixel template has no built-in consent checks, and these tags have no additional consent requirement, so they fire for visitors who ` +
            `declined advertising cookies. That's a privacy compliance risk in regions that need opt-in consent.`,
          fix: {
            title: 'Require ad_storage consent on all Meta Pixel tags',
            rationale: 'Only fire Meta Pixel tags once advertising consent is granted. Server-side CAPI still sends events according to your consent policy.',
            risk: 'medium',
            manualSteps: tags.map((t) => `GTM Web → Tags → ${t.name} → Advanced → Consent settings → Require additional consent: ad_storage`),
            verifyAfter: ['In GTM Preview with consent denied, Meta tags show as "Blocked by consent"', 'Expect fewer browser events from regions with opt-in consent'],
            ops: tags.flatMap((t) => [
              { entityId: t.id, field: 'consent.status', to: 'needed' },
              { entityId: t.id, field: 'consent.types', to: 'ad_storage' },
            ]),
          },
        },
      ];
    },
  },
  {
    id: 'CN-03',
    category: 'consent',
    severity: 'high',
    name: 'Consent defaults do not fire on Consent Initialization',
    dataBased: false,
    check(ctx) {
      const g = ctx.graph;
      return of(ctx, 'gtm_tag', 'gtm_web')
        .filter((t) => cfg(t).tagType === 'consent_defaults')
        .filter((t) => !(cfg(t).firingTriggerIds as string[]).some((id) => cfg(g.byId.get(id) ?? ({ config: {} } as Entity)).triggerType === 'Consent Initialization'))
        .map((t) => ({
          entityIds: [t.id],
          linkIds: [],
          title: 'Consent defaults load too late',
          evidence: { Tag: t.name },
          diagnosis: 'Consent defaults must fire on Consent Initialization so they are set before any Google tag loads.',
        }));
    },
  },
  {
    id: 'CF-01',
    category: 'configuration',
    severity: 'high',
    name: 'GA4 measurement ID in GTM does not match the GA4 web stream',
    dataBased: false,
    check(ctx) {
      const ids = new Set(of(ctx, 'ga4_stream').map((s) => cfg(s).measurementId));
      return of(ctx, 'gtm_tag', 'gtm_web')
        .filter((t) => ['google_tag', 'ga4_event'].includes(cfg(t).tagType) && !ids.has(cfg(t).measurementId))
        .map((t) => ({
          entityIds: [t.id],
          linkIds: [],
          title: `"${t.name}" sends to an unknown measurement ID`,
          evidence: { 'Measurement ID': cfg(t).measurementId },
          diagnosis: `"${t.name}" sends to ${cfg(t).measurementId}, which is not a stream of the GA4 property.`,
        }));
    },
  },
  {
    id: 'CF-02',
    category: 'configuration',
    severity: 'high',
    name: 'Google tag missing server_container_url',
    dataBased: false,
    check(ctx) {
      if (!of(ctx, 'gtm_container', 'gtm_server').length) return [];
      return of(ctx, 'gtm_tag', 'gtm_web')
        .filter((t) => cfg(t).tagType === 'google_tag' && !cfg(t).serverContainerUrl)
        .map((t) => ({
          entityIds: [t.id],
          linkIds: [],
          title: `"${t.name}" bypasses the server container`,
          evidence: { 'server_container_url': '(not set)' },
          diagnosis: 'Without server_container_url, GA4 hits go straight to Google and the server container (and Meta CAPI) never sees them.',
        }));
    },
  },
  {
    id: 'CF-03',
    category: 'configuration',
    severity: 'high',
    name: 'Google Ads auto-tagging is off',
    dataBased: false,
    check(ctx) {
      return of(ctx, 'gads_account')
        .filter((a) => !cfg(a).autoTaggingEnabled)
        .map((a) => ({ entityIds: [a.id], linkIds: [], title: 'Auto-tagging is off', evidence: {}, diagnosis: 'Without auto-tagging, no gclid is added to ad clicks.' }));
    },
  },
  {
    id: 'CF-04',
    category: 'configuration',
    severity: 'medium',
    name: 'Enhanced conversions for leads enabled but no user data sent',
    dataBased: false,
    check(ctx) {
      const g = ctx.graph;
      const account = of(ctx, 'gads_account')[0];
      if (!account || !cfg(account).enhancedConversionsForLeads) return [];
      const out: Finding[] = [];
      for (const t of of(ctx, 'gtm_tag', 'gtm_web').filter((t) => cfg(t).tagType === 'ads_conversion' && !cfg(t).enhancedConversions.enabled)) {
        const action = g.links.filter((l) => l.type === 'sends_to' && l.from === t.id).map((l) => g.byId.get(l.to)!)[0];
        if (!action || !['SUBMIT_LEAD_FORM', 'BOOK_APPOINTMENT', 'SIGNUP'].includes(cfg(action).category)) continue;
        out.push({
          entityIds: [t.id, action.id, account.id],
          linkIds: linksWhere(ctx, (l) => l.type === 'sends_to' && l.from === t.id),
          title: `"${t.name}" doesn't send user data for enhanced conversions`,
          evidence: {
            'Account setting': 'Enhanced conversions for leads: On',
            Tag: `${t.name} — enhanced conversions: Off`,
            'Conversion action': action.name,
            'User-provided data variable available': '{{UPD – Lead form}}',
          },
          diagnosis:
            `Enhanced conversions for leads is switched on in Google Ads and the customer data terms are accepted, but "${t.name}" sends no hashed email or phone. ` +
            `Google can't match these leads to signed-in users, so conversions from users without a gclid cookie go unrecorded. Offline "Qualified Lead" uploads ` +
            `also can't fall back to email matching.`,
          fix: {
            title: `Turn on enhanced conversions in "${t.name}"`,
            rationale: 'Use the existing User-Provided Data variable built from the form fields.',
            risk: 'low',
            manualSteps: [`GTM Web → Tags → ${t.name} → Include user-provided data from your website → {{UPD – Lead form}}`],
            verifyAfter: ['Google Ads → Conversions → Diagnostics shows enhanced conversions as "Recording" within 72 hours'],
            ops: [
              { entityId: t.id, field: 'enhancedConversions.enabled', to: true },
              { entityId: t.id, field: 'enhancedConversions.userDataVariable', to: '{{UPD – Lead form}}' },
            ],
          },
        });
      }
      return out;
    },
  },
  {
    id: 'CF-05',
    category: 'configuration',
    severity: 'medium',
    name: 'GA4 ↔ Google Ads link missing or personalisation disabled',
    dataBased: false,
    check(ctx) {
      const g = ctx.graph;
      const link = g.links.find((l) => l.type === 'product_link');
      const ga4Link = of(ctx, 'ga4_link')[0];
      if (link && ga4Link && cfg(ga4Link).adsPersonalizationEnabled) return [];
      return [{ entityIds: ga4Link ? [ga4Link.id] : [], linkIds: link ? [link.id] : [], title: 'GA4 is not fully linked to Google Ads', evidence: {}, diagnosis: 'Without the link, GA4 audiences and key events cannot be used in Google Ads.' }];
    },
  },
  {
    id: 'CF-06',
    category: 'configuration',
    severity: 'low',
    name: 'Tag references a missing trigger, or a server tag can never fire',
    dataBased: false,
    check(ctx) {
      const g = ctx.graph;
      const out: Finding[] = [];
      for (const t of of(ctx, 'gtm_tag').filter((t) => t.status === 'active' && !cfg(t).paused)) {
        const missing = (cfg(t).firingTriggerIds as string[]).filter((id) => !g.byId.has(id));
        if (!missing.length) continue;
        const deletion = ctx.changeEvents.find((c) => missing.some((m) => c.entityIds.includes(m)));
        out.push({
          entityIds: [t.id],
          linkIds: [],
          title: `"${t.name}" fires on a trigger that no longer exists`,
          evidence: {
            Tag: t.name,
            'Missing trigger IDs': missing.map((m) => m.split(':').pop()).join(', '),
            ...(deletion ? { 'Trigger deleted in': `${deletion.summary.replace('Published ', '')} (${deletion.at.slice(0, 10)})` } : {}),
          },
          diagnosis:
            `"${t.name}" still points at a trigger that was deleted, so it can never fire. It's harmless today, but it clutters the container and ` +
            `will start firing unexpectedly if someone re-creates a trigger with that ID or reattaches it. Pause it (or delete it in GTM).`,
          fix: {
            title: `Pause "${t.name}"`,
            rationale: 'The tag has no working trigger; pausing keeps it for reference without risk.',
            risk: 'low',
            manualSteps: [`GTM Web → Tags → ${t.name} → Pause (or delete)`],
            verifyAfter: ['Container has no tags referencing deleted triggers'],
            ops: [{ entityId: t.id, field: 'paused', to: true }],
          },
        });
      }
      return out;
    },
  },
  {
    id: 'DQ-01',
    category: 'data_quality',
    severity: 'medium',
    name: 'Conversion counts differ between platforms beyond tolerance (25%)',
    dataBased: true,
    check(ctx) {
      const g = ctx.graph;
      const m = ctx.metrics;
      const pairs: [string, string][] = [
        ['generate_lead', 'Lead'],
        ['book_consultation', 'Schedule'],
        ['sign_up', 'CompleteRegistration'],
      ];
      const out: Finding[] = [];
      for (const [ga4Name, metaName] of pairs) {
        const ga4 = g.byId.get(`ga4:event:${ga4Name}`);
        const meta = g.byId.get(`meta:event:${metaName}`);
        if (!ga4 || !meta) continue;
        const ga4Total = m.last(m.get(ga4.id, 'events'), 28);
        const b = m.last(m.get(meta.id, 'events_browser'), 28);
        const s = m.last(m.get(meta.id, 'events_server'), 28);
        const deduped = (cfg(meta).dedupBrowserPct ?? 0) >= 50;
        const metaTotal = deduped ? Math.max(b, s) * 1.02 : b + s;
        const ratio = ga4Total > 0 ? metaTotal / ga4Total : 1;
        if (Math.abs(ratio - 1) <= 0.25) continue;
        const pixelTag = g.links.find((l) => l.type === 'deduplicates_with' && cfg(g.byId.get(l.from)!).eventName === metaName);
        out.push({
          entityIds: [meta.id, ga4.id],
          linkIds: pixelTag ? [pixelTag.id] : [],
          title: `Meta reports ${ratio.toFixed(1)}× more "${metaName}" than GA4 records "${ga4Name}"`,
          evidence: {
            [`GA4 ${ga4Name} (28d)`]: fmt(ga4Total),
            [`Meta ${metaName} browser (28d)`]: fmt(b),
            [`Meta ${metaName} server (28d)`]: fmt(s),
            'Meta deduplication active': deduped ? 'Yes' : 'No',
            [`Meta ${metaName} as reported (28d)`]: fmt(metaTotal),
            Ratio: `${ratio.toFixed(2)}×`,
          },
          diagnosis:
            `Over the last 28 days Meta counted ${fmt(metaTotal)} ${metaName} events against ${fmt(ga4Total)} ${ga4Name} events in GA4. Both are fed by the same form submission, ` +
            `so they should be within about 25% of each other. ${deduped ? '' : 'Meta is not deduplicating Pixel and CAPI copies of this event, so most leads are counted twice. '}` +
            `Fixing deduplication (MT-01) resolves this; confirm with the next few days of data.`,
          fixedBy: pixelTag ? { ruleId: 'MT-01', entityId: pixelTag.from } : undefined,
        });
      }
      return out;
    },
  },
];
