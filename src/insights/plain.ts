import type { Anomaly, Entity, Issue, Severity } from '../model/schema';

// Plain-language copy for clients. Rules produce precise technical titles and diagnoses (shown in
// Detailed mode); this layer says what is happening and why it matters in business terms.
// Canned in Phase 1; an LLM can generate it in Phase 2 from the same inputs.

export interface PlainCopy {
  headline: string;
  impact: string;
}

export const SEVERITY_PLAIN: Record<Severity, { label: string; hint: string }> = {
  critical: { label: 'Urgent', hint: 'Conversions are being lost or misreported right now' },
  high: { label: 'Important', hint: 'Skews results or bidding; fix soon' },
  medium: { label: 'Worth fixing', hint: 'Weakens data quality over time' },
  low: { label: 'Minor', hint: 'Housekeeping' },
};

const fmtDay = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

type Ctx = { issue: Issue; names: (kind?: Entity['kind']) => string[]; since?: string };

const COPY: Record<string, (c: Ctx) => PlainCopy> = {
  'CT-01': ({ names, since }) => ({
    headline: `Google Ads stopped receiving "${names('gads_conversion_action')[0] ?? 'consultation'}" conversions`,
    impact: `Bookings are still happening and GA4 still records them, but Google Ads has received none${since ? ` since ${since}` : ''}. Campaigns that bid on consultations are now bidding blind and will undervalue this traffic.`,
  }),
  'CT-02': ({ since }) => ({
    headline: 'Quote requests stopped being tracked',
    impact: `Quote requests dropped about 90% in GA4, Google Ads and Meta${since ? ` from ${since}` : ''} while website traffic stayed normal. This is a tracking break, not a real drop in leads — but bidding algorithms can't tell the difference.`,
  }),
  'CT-03': ({ names }) => ({
    headline: `Phone calls are over-counted in Google Ads`,
    impact: `"${names('gads_conversion_action')[0]}" counts every tap on the phone number, so one person tapping three times looks like three leads. Reported results look better than they are.`,
  }),
  'CT-04': () => ({
    headline: 'Quote requests are counted twice in Google Ads',
    impact: 'Two conversion actions both count the same quote request as a main goal. Google Ads reports roughly double the leads and bids as if leads were cheaper than they really are.',
  }),
  'CT-07': ({ issue }) => ({
    headline: 'Qualified leads from your CRM stopped reaching Google Ads',
    impact: `No offline uploads for ${String(issue.title.match(/\d+/)?.[0] ?? 'several')} days. Google Ads can no longer learn which clicks turn into real sales opportunities, which is the signal it optimises for.`,
  }),
  'MT-01': () => ({
    headline: 'Meta is double counting leads',
    impact: "The website and the server both send each lead to Meta without a shared ID, so Meta can't tell they're the same lead. It reports almost twice as many leads as really happened.",
  }),
  'MT-02': () => ({
    headline: "Meta can't match many leads to real people",
    impact: 'Leads reach Meta without a (securely hashed) email or phone number, so Meta matches fewer of them to the people who saw your ads and optimises less well.',
  }),
  'CK-01': () => ({
    headline: "Google Ads click IDs aren't saved on every page",
    impact: "If someone lands on one page and converts on another, the click ID can be lost and Google Ads won't credit the ad that brought them.",
  }),
  'CK-03': () => ({
    headline: "Meta click IDs aren't passed along with server events",
    impact: 'Events sent from the server to Meta are missing the cookies that tie them to an ad click, which weakens attribution and matching.',
  }),
  'CN-01': () => ({
    headline: 'Consent settings are missing two signals Google requires',
    impact: "Google's Consent Mode v2 needs ad_user_data and ad_personalization to be set. Without them, conversion measurement and remarketing for EEA visitors can be limited.",
  }),
  'CN-02': ({ issue }) => ({
    headline: 'Meta Pixel runs before visitors give consent',
    impact: `${issue.entityIds.length} Meta Pixel tags load without checking consent first. That's a privacy compliance risk rather than a data problem.`,
  }),
  'CF-04': () => ({
    headline: 'Enhanced conversions are switched on but receive no data',
    impact: "Google Ads is expecting customer data with each quote request to improve matching, but the tag doesn't send any, so the feature has no effect.",
  }),
  'CF-06': ({ names }) => ({
    headline: 'An old Google Ads tag is broken',
    impact: `"${names('gtm_tag')[0]}" is set to fire on a trigger that was deleted, so it never runs. It's clutter rather than a data problem.`,
  }),
  'DQ-01': () => ({
    headline: 'Meta and GA4 disagree on how many leads you got',
    impact: 'Meta reports almost twice as many leads as GA4. This is usually a symptom of double counting — fixing that should bring the numbers back in line.',
  }),
};

export function plainIssue(issue: Issue, byId: Map<string, Entity>, anomalies: Anomaly[]): PlainCopy {
  const fn = COPY[issue.ruleId];
  if (!fn) return { headline: issue.title, impact: issue.diagnosis };
  const ents = issue.entityIds.map((id) => byId.get(id)).filter((e): e is Entity => !!e);
  const names = (kind?: Entity['kind']) => ents.filter((e) => !kind || e.kind === kind).map((e) => e.name);
  const starts = anomalies.map((a) => a.window.start).sort();
  return fn({ issue, names, since: starts[0] ? fmtDay(starts[0]) : undefined });
}

const pct = (x: number) => `${Math.abs(Math.round(x * 100))}%`;

export function plainAnomaly(a: Anomaly, e: Entity | undefined): PlainCopy {
  const name = e?.name ?? 'A metric';
  const up = a.changePct > 0;
  switch (a.type) {
    case 'bot_traffic':
      return {
        headline: `Suspicious traffic on "${name}"`,
        impact: `Clicks jumped ${pct(a.changePct)} from ${fmtDay(a.window.start)} to ${fmtDay(a.window.end)} without a matching rise in spend or engagement — a pattern typical of bots or junk placements. Leads from this period may not be real.`,
      };
    case 'spend_driven':
      return {
        headline: `"${name}" ${up ? 'spend went up' : 'spend dropped'} — results moved with it`,
        impact: `Spend changed ${up ? 'by +' : 'by −'}${pct(a.changePct)} from ${fmtDay(a.window.start)}, and clicks and conversions moved in proportion. This is expected when budgets change; no tracking problem.`,
      };
    case 'tracking_outage':
      return {
        headline: `"${name}" ${up ? 'spiked' : 'dropped'} ${pct(a.changePct)} while traffic held`,
        impact: `From ${fmtDay(a.window.start)}, ${name} moved sharply while clicks and sessions stayed steady — a sign that tracking changed rather than real performance.`,
      };
  }
}

/** Short status sentence for the overview banner. */
export function overallSentence(counts: Record<Severity, number>): { tone: 'good' | 'warn' | 'bad'; text: string } {
  if (counts.critical) return { tone: 'bad', text: `${counts.critical} urgent problem${counts.critical > 1 ? 's are' : ' is'} affecting your conversion tracking` };
  if (counts.high) return { tone: 'warn', text: `${counts.high} important problem${counts.high > 1 ? 's need' : ' needs'} attention` };
  if (counts.medium + counts.low) return { tone: 'good', text: 'Tracking is working — a few things are worth tidying up' };
  return { tone: 'good', text: 'Everything is tracking as expected' };
}
