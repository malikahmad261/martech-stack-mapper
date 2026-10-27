import { BEATS } from '../timeline';
import { TRUTH } from '../truth';

// Shapes follow the Meta Marketing API (Graph API) and the Conversions API Dataset Quality API.

type MatchKey = 'email' | 'phone' | 'fbc' | 'fbp' | 'client_ip_address' | 'client_user_agent' | 'external_id';

export interface MetaRaw {
  adAccount: { id: string; account_id: string; name: string; currency: string; timezone_name: string; account_status: number };
  dataset: {
    id: string;
    name: string;
    last_fired_time: string;
    first_party_cookie_status: 'FIRST_PARTY_COOKIE_ENABLED' | 'FIRST_PARTY_COOKIE_DISABLED';
    automatic_matching_fields: string[];
    is_unavailable: boolean;
  };
  datasetQuality: {
    web: {
      event_name: string;
      event_match_quality?: { composite_score: number; match_key_feedback: { identifier: MatchKey; coverage: { percentage: number } }[] };
      dedupe_key_feedback?: {
        dedupe_key: 'event_id';
        browser_events_with_dedupe_key: { percentage: number };
        server_events_with_dedupe_key: { percentage: number };
      }[];
      event_coverage?: { percentage: number };
    }[];
  };
  customConversions: { id: string; name: string; rule: string; custom_event_type: string; pixel: { id: string } }[];
  campaigns: {
    id: string;
    name: string;
    status: 'ACTIVE' | 'PAUSED';
    objective: 'OUTCOME_LEADS';
    adsets: { id: string; name: string; promoted_object: { pixel_id: string; custom_event_type?: string; custom_conversion_id?: string } }[];
  }[];
  insights: {
    campaign_id: string;
    date_start: string;
    spend: string;
    impressions: string;
    clicks: string;
    actions: { action_type: string; value: string }[];
  }[];
  insightsByPlacement: { campaign_id: string; date_start: string; publisher_platform: string; clicks: string }[];
  pixelStats: { date: string; event: string; source: 'browser' | 'server'; count: number }[];
  activities: { event_time: string; event_type: string; object_id: string; object_name: string; actor_name: string; extra_data: string }[];
}

const CAMPAIGNS = [
  { key: 'prospecting_lookalike', id: '120210000000001', name: 'Prospecting – Lookalike', promoted: { custom_event_type: 'LEAD' } },
  { key: 'retargeting', id: '120210000000002', name: 'Retargeting – Site Visitors', promoted: { custom_event_type: 'LEAD' } },
  { key: 'prospecting_interests', id: '120210000000003', name: 'Prospecting – Interests', promoted: { custom_conversion_id: '5544332211' } },
] as const;

const PIXEL = '887766554433221';

function pixelStats(): MetaRaw['pixelStats'] {
  const rows: MetaRaw['pixelStats'] = [];
  TRUTH.forEach((day, i) => {
    const quoteTracked = i >= BEATS.quoteTriggerBroken ? 0.1 : 1;
    const leads = (day.quotes + day.spamQuotes) * quoteTracked;
    const scheduleServerDown = i >= BEATS.capiScheduleBrokenFrom && i < BEATS.capiScheduleFixedOn;
    const sessions = Object.values(day.sessions).reduce((a, b) => a + b, 0);
    const events: [string, number, number][] = [
      // [event, browser, server] — browser is lower because of ad blockers and consent
      ['PageView', sessions * 2.1, 0],
      ['Lead', leads * 0.84, leads * 0.97],
      ['Schedule', day.consults * 0.84, scheduleServerDown ? 0 : day.consults * 0.97],
      ['Contact', day.phoneClicks * 0.84, 0],
      ['CompleteRegistration', day.signups * 0.84, day.signups * 0.97],
    ];
    for (const [event, browser, server] of events) {
      rows.push({ date: day.date, event, source: 'browser', count: Math.round(browser) });
      if (server > 0 || event !== 'PageView') rows.push({ date: day.date, event, source: 'server', count: Math.round(server) });
    }
  });
  return rows.filter((r) => !(r.source === 'server' && (r.event === 'PageView' || r.event === 'Contact')));
}

function insights() {
  const rows: MetaRaw['insights'] = [];
  const byPlacement: MetaRaw['insightsByPlacement'] = [];
  for (const day of TRUTH) {
    for (const c of CAMPAIGNS) {
      const d = day.meta[c.key];
      rows.push({
        campaign_id: c.id,
        date_start: day.date,
        spend: d.spend.toFixed(2),
        impressions: String(d.impressions),
        clicks: String(d.clicks),
        actions: [{ action_type: 'offsite_conversion.fb_pixel_lead', value: String(d.leads) }],
      });
      if (c.key === 'prospecting_lookalike') {
        for (const [platform, clicks] of Object.entries(d.clicksByPlacement)) {
          byPlacement.push({ campaign_id: c.id, date_start: day.date, publisher_platform: platform, clicks: String(clicks) });
        }
      }
    }
  }
  return { rows, byPlacement };
}

const ins = insights();

export const metaRaw: MetaRaw = {
  adAccount: { id: 'act_1029384756', account_id: '1029384756', name: 'BrightPath Solar', currency: 'USD', timezone_name: 'America/Los_Angeles', account_status: 1 },
  dataset: {
    id: PIXEL,
    name: 'BrightPath Solar Pixel',
    last_fired_time: '2026-10-27T05:58:41+0000',
    first_party_cookie_status: 'FIRST_PARTY_COOKIE_ENABLED',
    automatic_matching_fields: ['em', 'ph'],
    is_unavailable: false,
  },
  datasetQuality: {
    web: [
      {
        event_name: 'Lead',
        event_match_quality: {
          composite_score: 4.1,
          match_key_feedback: [
            { identifier: 'email', coverage: { percentage: 0 } },
            { identifier: 'phone', coverage: { percentage: 0 } },
            { identifier: 'fbc', coverage: { percentage: 0 } },
            { identifier: 'fbp', coverage: { percentage: 0 } },
            { identifier: 'client_ip_address', coverage: { percentage: 99 } },
            { identifier: 'client_user_agent', coverage: { percentage: 99 } },
          ],
        },
        dedupe_key_feedback: [{ dedupe_key: 'event_id', browser_events_with_dedupe_key: { percentage: 0 }, server_events_with_dedupe_key: { percentage: 100 } }],
        event_coverage: { percentage: 115 },
      },
      {
        event_name: 'Schedule',
        event_match_quality: {
          composite_score: 7.4,
          match_key_feedback: [
            { identifier: 'email', coverage: { percentage: 96 } },
            { identifier: 'phone', coverage: { percentage: 88 } },
            { identifier: 'fbc', coverage: { percentage: 0 } },
            { identifier: 'fbp', coverage: { percentage: 0 } },
            { identifier: 'client_ip_address', coverage: { percentage: 99 } },
            { identifier: 'client_user_agent', coverage: { percentage: 99 } },
          ],
        },
        dedupe_key_feedback: [{ dedupe_key: 'event_id', browser_events_with_dedupe_key: { percentage: 99 }, server_events_with_dedupe_key: { percentage: 100 } }],
        event_coverage: { percentage: 98 },
      },
      {
        event_name: 'CompleteRegistration',
        event_match_quality: {
          composite_score: 6.3,
          match_key_feedback: [
            { identifier: 'email', coverage: { percentage: 97 } },
            { identifier: 'phone', coverage: { percentage: 0 } },
            { identifier: 'fbc', coverage: { percentage: 0 } },
            { identifier: 'fbp', coverage: { percentage: 0 } },
            { identifier: 'client_ip_address', coverage: { percentage: 99 } },
            { identifier: 'client_user_agent', coverage: { percentage: 99 } },
          ],
        },
        dedupe_key_feedback: [{ dedupe_key: 'event_id', browser_events_with_dedupe_key: { percentage: 99 }, server_events_with_dedupe_key: { percentage: 100 } }],
        event_coverage: { percentage: 97 },
      },
      { event_name: 'PageView' },
      { event_name: 'Contact' },
    ],
  },
  customConversions: [
    {
      id: '5544332211',
      name: 'Qualified Lead (form)',
      rule: JSON.stringify({ and: [{ event: { eq: 'Lead' } }, { lead_type: { eq: 'qualified' } }] }),
      custom_event_type: 'LEAD',
      pixel: { id: PIXEL },
    },
  ],
  campaigns: CAMPAIGNS.map((c, i) => ({
    id: c.id,
    name: c.name,
    status: 'ACTIVE' as const,
    objective: 'OUTCOME_LEADS' as const,
    adsets: [{ id: `${c.id}${i}`, name: `${c.name} – Ad set`, promoted_object: { pixel_id: PIXEL, ...c.promoted } }],
  })),
  insights: ins.rows,
  insightsByPlacement: ins.byPlacement,
  pixelStats: pixelStats(),
  activities: [
    {
      event_time: '2026-10-01T16:20:00+0000',
      event_type: 'update_campaign_run_status',
      object_id: '120210000000002',
      object_name: 'Retargeting – Site Visitors',
      actor_name: 'Alex Rivera',
      extra_data: JSON.stringify({ old_value: 'ACTIVE', new_value: 'PAUSED' }),
    },
    {
      event_time: '2026-10-06T08:05:00+0000',
      event_type: 'update_campaign_run_status',
      object_id: '120210000000002',
      object_name: 'Retargeting – Site Visitors',
      actor_name: 'Alex Rivera',
      extra_data: JSON.stringify({ old_value: 'PAUSED', new_value: 'ACTIVE' }),
    },
  ],
};
