import { BEATS, DAYS, dateAt } from './timeline';

// Deterministic "what really happened" daily series. The per-platform raw generators
// derive what each tool would have reported from this, including tracking breakages.

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261027);
const jitter = (x: number, pct = 0.07) => x * (1 + (rand() - 0.5) * 2 * pct);

function weekdayFactor(date: string): number {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6 ? 0.82 : 1;
}

export interface AdsCampaignDay {
  spend: number;
  impressions: number;
  clicks: number;
}

export interface MetaCampaignDay extends AdsCampaignDay {
  leads: number;
  clicksByPlacement: Record<'facebook' | 'instagram' | 'audience_network', number>;
}

export interface TruthDay {
  date: string;
  ads: Record<'search_quotes' | 'search_brand' | 'pmax', AdsCampaignDay>;
  meta: Record<'prospecting_lookalike' | 'retargeting' | 'prospecting_interests', MetaCampaignDay>;
  // Real on-site actions (including spam submissions during the bot window).
  quotes: number;
  spamQuotes: number;
  consults: number;
  phoneClicks: number;
  signups: number;
  qualifiedLeads: number;
  sessions: Record<'Paid Search' | 'Paid Social' | 'Organic Search' | 'Direct' | 'Referral', number>;
  engagedSessions: Record<'Paid Search' | 'Paid Social' | 'Organic Search' | 'Direct' | 'Referral', number>;
  botSessions: number;
}

function adsDay(spend: number, cpc: number, ctr: number): AdsCampaignDay {
  const s = jitter(spend, 0.05);
  const clicks = jitter(s / cpc, 0.06);
  return { spend: round2(s), clicks: Math.round(clicks), impressions: Math.round(jitter(clicks / ctr, 0.05)) };
}

function metaDay(spend: number, cpm: number, ctr: number, leadRate: number): MetaCampaignDay {
  const s = jitter(spend, 0.05);
  const impressions = Math.round(jitter((s / cpm) * 1000, 0.05));
  const clicks = Math.round(jitter(impressions * ctr, 0.06));
  return {
    spend: round2(s),
    impressions,
    clicks,
    leads: Math.round(jitter(clicks * leadRate, 0.1)),
    clicksByPlacement: {
      facebook: Math.round(clicks * 0.55),
      instagram: Math.round(clicks * 0.35),
      audience_network: clicks - Math.round(clicks * 0.55) - Math.round(clicks * 0.35),
    },
  };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

function build(): TruthDay[] {
  const out: TruthDay[] = [];
  for (let d = 0; d < DAYS; d++) {
    const date = dateAt(d);
    const wf = weekdayFactor(date);

    const searchBudget = d >= BEATS.searchBudgetRaised ? 420 : 300;
    const ads = {
      search_quotes: adsDay(searchBudget * wf, 6.1, 0.058),
      search_brand: adsDay(60 * wf, 1.45, 0.21),
      pmax: adsDay(200 * wf, 2.95, 0.012),
    };

    const retargetingPaused = d >= BEATS.retargetingPausedFrom && d < BEATS.retargetingResumedOn;
    const bot = d >= BEATS.botTrafficFrom && d <= BEATS.botTrafficTo;
    const lookalike = metaDay(150 * wf, 24, 0.012, 0.03);
    const lookalikeHumanClicks = lookalike.clicks;
    if (bot) {
      const extra = Math.round(lookalike.clicks * jitter(2.6, 0.08));
      lookalike.clicks += extra;
      lookalike.clicksByPlacement.audience_network += extra;
      lookalike.leads = Math.round(lookalike.leads * 1.6);
    }
    const retargeting = retargetingPaused
      ? { spend: 0, impressions: 0, clicks: 0, leads: 0, clicksByPlacement: { facebook: 0, instagram: 0, audience_network: 0 } }
      : metaDay(70 * wf, 31, 0.018, 0.06);
    const interests = metaDay(90 * wf, 22, 0.01, 0.025);
    const meta = { prospecting_lookalike: lookalike, retargeting, prospecting_interests: interests };

    const adsClicks = ads.search_quotes.clicks + ads.search_brand.clicks + ads.pmax.clicks;
    const metaHumanClicks = lookalikeHumanClicks + retargeting.clicks + interests.clicks;

    const organic = jitter(900 * wf);
    const direct = jitter(400 * wf);
    const referral = jitter(80 * wf);
    const botSessions = bot ? Math.round(lookalike.clicksByPlacement.audience_network * 0.85) : 0;
    const sessions = {
      'Paid Search': Math.round(adsClicks * 0.93),
      'Paid Social': Math.round(metaHumanClicks * 0.85) + botSessions,
      'Organic Search': Math.round(organic),
      Direct: Math.round(direct),
      Referral: Math.round(referral),
    };
    const engagedSessions = {
      'Paid Search': Math.round(sessions['Paid Search'] * jitter(0.64, 0.04)),
      'Paid Social': Math.round((sessions['Paid Social'] - botSessions) * jitter(0.58, 0.04) + botSessions * 0.04),
      'Organic Search': Math.round(sessions['Organic Search'] * jitter(0.62, 0.04)),
      Direct: Math.round(sessions.Direct * jitter(0.55, 0.04)),
      Referral: Math.round(sessions.Referral * jitter(0.6, 0.04)),
    };

    const quotes = Math.round(jitter(adsClicks * 0.075 + metaHumanClicks * 0.03 + organic * 0.012));
    const spamQuotes = bot ? Math.round(jitter(9)) : 0;
    const consults = Math.round(jitter(adsClicks * 0.02 + organic * 0.004));
    const phoneClicks = Math.round(jitter(adsClicks * 0.03 + organic * 0.006));
    const signups = Math.round(jitter(organic * 0.009 + direct * 0.006));
    const qualifiedLeads = Math.round(jitter(quotes * 0.22, 0.15));

    out.push({ date, ads, meta, quotes, spamQuotes, consults, phoneClicks, signups, qualifiedLeads, sessions, engagedSessions, botSessions });
  }
  return out;
}

export const TRUTH: TruthDay[] = build();
