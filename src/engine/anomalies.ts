import type { Anomaly, ChangeEvent, Entity, Issue, MetricName } from '../model/schema';
import type { Graph } from './graph';
import type { MetricIndex } from './metrics';

// See docs/REQUIREMENTS.md §7. Baseline = median of the same weekday over the previous 4 weeks.
// Once a window opens, the baseline is frozen at the window start so a sustained change (an
// ongoing outage, a permanent budget increase) stays flagged instead of becoming the new normal.

const Z = 3;
const MIN_REL = 0.3;
const MIN_ABS = 2;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function baselineAt(series: number[], i: number, before = i) {
  const vals: number[] = [];
  for (let j = i - 7; j >= 0 && vals.length < 4; j -= 7) if (j < before) vals.push(series[j]);
  if (vals.length < 4) return null;
  const med = median(vals);
  const mad = median(vals.map((v) => Math.abs(v - med))) * 1.4826;
  return { base: med, scale: Math.max(mad, med * 0.1, 1) };
}

interface Window {
  start: number;
  end: number;
  direction: 1 | -1;
}

// Opening a window needs a strong signal; keeping it open only needs the deviation to persist
// (hysteresis), so low-volume weekend days don't split one outage into several.
function isAnomalous(x: number, b: { base: number; scale: number }, dir?: 1 | -1, continuing = false) {
  const diff = x - b.base;
  const rel = b.base > 0 ? diff / b.base : x > 0 ? 1 : 0;
  const ok = continuing ? Math.abs(rel) >= MIN_REL : Math.abs(diff / b.scale) >= Z && Math.abs(rel) >= MIN_REL && Math.abs(diff) >= MIN_ABS;
  return ok && (!dir || Math.sign(diff) === dir);
}

export function detectWindows(series: number[], only?: 1 | -1): Window[] {
  const out: Window[] = [];
  let i = 28;
  while (i < series.length) {
    const b = baselineAt(series, i);
    if (!b || !isAnomalous(series[i], b, only)) {
      i++;
      continue;
    }
    const direction = (series[i] > b.base ? 1 : -1) as 1 | -1;
    const start = i;
    let end = i;
    let gap = 0;
    for (let j = i + 1; j < series.length; j++) {
      const fb = baselineAt(series, j, start);
      if (fb && isAnomalous(series[j], fb, direction, true)) {
        end = j;
        gap = 0;
      } else if (++gap > 1) break;
    }
    out.push({ start, end, direction });
    i = end + 2;
  }
  return out;
}

/** Average observed vs frozen-baseline value over a window. */
function windowStats(series: number[], w: { start: number; end: number }) {
  let obs = 0;
  let base = 0;
  for (let j = w.start; j <= w.end; j++) {
    obs += series[j];
    base += baselineAt(series, j, w.start)?.base ?? 0;
  }
  const n = w.end - w.start + 1;
  return { observed: obs / n, baseline: base / n, change: base > 0 ? obs / base - 1 : 0 };
}

const pct = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%`;
const r1 = (x: number) => Math.round(x * 10) / 10;

export function detectAnomalies(graph: Graph, metrics: MetricIndex, changeEvents: ChangeEvent[], issues: Issue[]): Anomaly[] {
  const dates = metrics.dates;
  const last = dates.length - 1;
  const anomalies: Anomaly[] = [];
  const dayOf = (iso: string) => dates.indexOf(iso.slice(0, 10));
  const nearStart = (w: Window, ce: ChangeEvent) => {
    const d = dayOf(ce.at);
    return d >= w.start - 1 && d <= w.start + 1;
  };
  const of = (kind: Entity['kind']) => graph.entities.filter((e) => e.kind === kind);

  // --- Campaign level: spend-driven vs bot traffic ---------------------------------------
  for (const c of [...of('gads_campaign'), ...of('meta_campaign')]) {
    const spend = metrics.get(c.id, 'spend');
    const clicks = metrics.get(c.id, 'clicks');
    const impressions = metrics.get(c.id, 'impressions');
    const conv = metrics.get(c.id, 'conversions');
    const windows = mergeWindows([...detectWindows(spend), ...detectWindows(clicks)]);
    for (const w of windows) {
      const s = windowStats(spend, w);
      const k = windowStats(clicks, w);
      const im = windowStats(impressions, w);
      const cv = windowStats(conv, w);
      const ctrBefore = im.baseline ? k.baseline / im.baseline : 0;
      const ctrAfter = im.observed ? k.observed / im.observed : 0;
      const changes = changeEvents.filter((ce) => ce.entityIds.includes(c.id) && nearStart(w, ce));
      const window = { start: dates[w.start], end: dates[w.end] };
      const ongoing = w.end >= last - 1;

      if (Math.abs(s.change) >= 0.2 && Math.sign(k.change) === Math.sign(s.change) && Math.abs(k.change - s.change) <= 0.35) {
        const cpcB = k.baseline ? s.baseline / k.baseline : 0;
        const cpcA = k.observed ? s.observed / k.observed : 0;
        anomalies.push({
          id: `spend_driven:${c.id}:${window.start}`,
          type: 'spend_driven',
          entityId: c.id,
          metric: 'spend',
          window,
          baseline: r1(s.baseline),
          observed: r1(s.observed),
          changePct: s.change,
          confidence: Math.min(0.97, 0.7 + (changes.length ? 0.25 : 0)),
          signals: [
            `Spend ${pct(s.change)} vs baseline`,
            `Clicks ${pct(k.change)} — moved with spend`,
            s.observed && k.observed ? `CPC $${cpcB.toFixed(2)} → $${cpcA.toFixed(2)}` : 'Campaign not serving',
            `Conversions ${pct(cv.change)}`,
          ],
          likelyCause: {
            changeEventIds: changes.map((x) => x.id),
            issueIds: [],
            explanation:
              `${c.name} spend ${s.change > 0 ? 'rose' : 'fell'} ${Math.round(Math.abs(s.change) * 100)}% ${ongoing ? `from ${window.start} and is still at the new level` : `between ${window.start} and ${window.end}`}, ` +
              `and clicks moved in proportion (${pct(k.change)}). ${changes.length ? `${changes[0].summary} (${changes[0].actor}, ${changes[0].at.slice(0, 10)}).` : 'No config change was found, so check bid or budget pacing.'} ` +
              `Traffic and conversion changes in this window are explained by spend, not by tracking.`,
          },
          recommendation:
            s.change > 0
              ? 'Expected if the budget increase was planned — mark as expected. Watch that cost per lead stays within target as spend scales.'
              : 'Expected if the pause was planned — mark as expected. If not, check why the campaign stopped serving.',
          status: 'new',
        });
      } else if (k.change >= 0.5 && s.change < 0.2) {
        const signals = [`Clicks ${pct(k.change)} with spend ${pct(s.change)}`, `CTR ${(ctrBefore * 100).toFixed(2)}% → ${(ctrAfter * 100).toFixed(2)}%`];
        let confidence = 0.5 + (ctrBefore && ctrAfter / ctrBefore >= 2 ? 0.15 : 0);
        const placements = metrics.dimensionValues(c.id, 'clicks', 'placement');
        let topPlacement = '';
        if (placements.length) {
          const extra = placements
            .map((p) => {
              const st = windowStats(metrics.get(c.id, 'clicks', { placement: p }), w);
              return { p, extra: st.observed - st.baseline };
            })
            .sort((a, b) => b.extra - a.extra);
          const total = extra.reduce((a, x) => a + Math.max(0, x.extra), 0);
          const share = total ? Math.max(0, extra[0].extra) / total : 0;
          topPlacement = extra[0].p.replace('_', ' ');
          signals.push(`${Math.round(share * 100)}% of the extra clicks came from ${topPlacement}`);
          if (share >= 0.6) confidence += 0.15;
        }
        const stream = of('ga4_stream')[0];
        if (stream && c.tool === 'meta') {
          const ses = windowStats(metrics.get(stream.id, 'sessions', { channel: 'Paid Social' }), w);
          const eng = windowStats(metrics.get(stream.id, 'engaged_sessions', { channel: 'Paid Social' }), w);
          const before = ses.baseline ? eng.baseline / ses.baseline : 0;
          const after = ses.observed ? eng.observed / ses.observed : 0;
          signals.push(`GA4 Paid Social engagement rate ${Math.round(before * 100)}% → ${Math.round(after * 100)}%`);
          if (before && after / before <= 0.6) confidence += 0.15;
        }
        signals.push(`Leads ${pct(cv.change)}`);
        anomalies.push({
          id: `bot_traffic:${c.id}:${window.start}`,
          type: 'bot_traffic',
          entityId: c.id,
          metric: 'clicks',
          window,
          baseline: r1(k.baseline),
          observed: r1(k.observed),
          changePct: k.change,
          confidence: Math.min(0.97, confidence),
          signals,
          likelyCause: {
            changeEventIds: [],
            issueIds: [],
            explanation:
              `${c.name} clicks rose ${pct(k.change)} between ${window.start} and ${window.end} while spend barely moved (${pct(s.change)}), and CTR jumped from ` +
              `${(ctrBefore * 100).toFixed(2)}% to ${(ctrAfter * 100).toFixed(2)}%. ${topPlacement ? `The extra clicks are concentrated in ${topPlacement}, ` : ''}` +
              `the visitors barely engage on site, and lead volume rose with them — the pattern of invalid clicks and form spam rather than real demand.`,
          },
          recommendation:
            `Exclude ${topPlacement || 'the affected placement'} from this campaign (or use manual placements), add spam protection to the quote form (honeypot / reCAPTCHA), ` +
            `and ask Meta for an invalid-activity credit for ${window.start} – ${window.end}. Consider excluding spam leads from the optimisation event so the algorithm doesn't learn from them.`,
          status: 'new',
        });
      }
    }
  }

  // --- Conversion endpoints: tracking outages ---------------------------------------------
  const traffic = (tool: string) => {
    if (tool === 'google_ads') return metrics.sum(of('gads_campaign').map((c) => metrics.get(c.id, 'clicks')));
    if (tool === 'meta') return metrics.sum(of('meta_campaign').map((c) => metrics.get(c.id, 'clicks')));
    const s = of('ga4_stream')[0];
    return metrics.sum(metrics.dimensionValues(s.id, 'sessions', 'channel').map((ch) => metrics.get(s.id, 'sessions', { channel: ch })));
  };
  const trafficLabel: Record<string, string> = { google_ads: 'Google Ads clicks', meta: 'Meta clicks', ga4: 'GA4 sessions' };
  const OUTAGE_RULES = new Set(['CT-01', 'CT-02', 'CT-07', 'MT-03', 'CF-01', 'CF-02']);

  const endpoints: { e: Entity; metric: MetricName; label: string }[] = [
    ...of('gads_conversion_action').map((e) => ({ e, metric: 'conversions' as const, label: 'conversions' })),
    ...of('ga4_event').filter((e) => metrics.has(e.id, 'events')).map((e) => ({ e, metric: 'events' as const, label: 'events' })),
    ...of('meta_event').flatMap((e) => [
      { e, metric: 'events_browser' as const, label: 'browser (Pixel) events' },
      { e, metric: 'events_server' as const, label: 'server (CAPI) events' },
    ]),
  ];
  const outages: Anomaly[] = [];
  for (const { e, metric, label } of endpoints) {
    if (!metrics.has(e.id, metric)) continue;
    const series = metrics.get(e.id, metric);
    const t = traffic(e.tool);
    for (const w of detectWindows(series, -1)) {
      const st = windowStats(series, w);
      const tr = windowStats(t, w);
      if (st.change > -0.5 || Math.abs(tr.change) > 0.25) continue;
      const window = { start: dates[w.start], end: dates[w.end] };
      const recovered = w.end < last - 1;
      const upstream = graph.reachable(e.id, 'up');
      upstream.add(e.id);
      const changes = changeEvents.filter((ce) => nearStart(w, ce) && ce.entityIds.some((id) => upstream.has(id)));
      const linked = issues.filter((i) => OUTAGE_RULES.has(i.ruleId) && i.status !== 'dismissed' && i.entityIds.some((id) => upstream.has(id)));
      const touched = changes[0] ? graph.byId.get(changes[0].entityIds.find((id) => upstream.has(id) && !id.includes(':container:'))!) : undefined;
      outages.push({
        id: `tracking_outage:${e.id}:${window.start}`,
        type: 'tracking_outage',
        entityId: e.id,
        metric,
        window,
        baseline: r1(st.baseline),
        observed: r1(st.observed),
        changePct: st.change,
        confidence: Math.min(0.97, 0.6 + (changes.length ? 0.25 : 0) + (linked.length ? 0.1 : 0)),
        signals: [
          `${e.name} ${label} ${pct(st.change)}`,
          `${trafficLabel[e.tool]} ${pct(tr.change)} — stable`,
          ...(changes.length ? [`${changes[0].summary.replace('Published ', 'Published ')} on ${changes[0].at.slice(0, 10)}`] : []),
          recovered ? `Recovered on ${dates[w.end + 1] ?? window.end}` : 'Ongoing',
        ],
        likelyCause: {
          changeEventIds: changes.map((c) => c.id),
          issueIds: linked.map((i) => i.id),
          explanation:
            `${e.name} ${label} fell ${Math.round(-st.change * 100)}% from ${window.start}${recovered ? ` until ${window.end}` : ''} while ${trafficLabel[e.tool]} stayed stable (${pct(tr.change)}), ` +
            `so this is a measurement problem rather than a real drop. ` +
            (changes.length
              ? `${changes[0].summary} (${changes[0].actor}, ${changes[0].at.slice(0, 10)})${touched ? ` changed "${touched.name}", which is upstream of this conversion` : ''}.`
              : linked.length
                ? `No config change lines up with the start, but open issue "${linked[0].title}" explains it.`
                : 'No config change lines up with the start; check the source system.') +
            (recovered ? ' Tracking recovered after a later change; data for the gap is lost.' : ''),
        },
        recommendation: recovered
          ? 'Already recovered. Note the gap when reporting on this period, and consider an annotation in GA4 and Google Ads.'
          : linked.length
            ? `Apply the fix for "${linked[0].title}" from the Fix Queue, then confirm conversions return with the next day of data.`
            : 'Check the upstream tags and triggers in GTM Preview for the affected event.',
        status: recovered ? 'resolved' : 'new',
      });
    }
  }
  // A Meta event whose browser and server copies broke together is one outage.
  for (const a of outages) {
    const twin = anomalies.find(
      (b) => b.type === 'tracking_outage' && b.entityId === a.entityId && b.window.start <= a.window.end && a.window.start <= b.window.end,
    );
    if (twin) {
      twin.metric = 'events';
      twin.signals = [...new Set([...twin.signals, ...a.signals])];
      twin.observed = r1(twin.observed + a.observed);
      twin.baseline = r1(twin.baseline + a.baseline);
      twin.changePct = twin.baseline ? twin.observed / twin.baseline - 1 : twin.changePct;
      twin.likelyCause.explanation = twin.likelyCause.explanation.replace(/(browser \(Pixel\)|server \(CAPI\)) events/, 'browser and server events');
    } else anomalies.push(a);
  }

  return anomalies.sort((a, b) => b.window.start.localeCompare(a.window.start));
}

function mergeWindows(ws: Window[]): Window[] {
  const sorted = [...ws].sort((a, b) => a.start - b.start);
  const out: Window[] = [];
  for (const w of sorted) {
    const prev = out[out.length - 1];
    if (prev && w.start <= prev.end + 1) prev.end = Math.max(prev.end, w.end);
    else out.push({ ...w });
  }
  return out;
}
