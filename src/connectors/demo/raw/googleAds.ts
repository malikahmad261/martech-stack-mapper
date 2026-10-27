import { BEATS } from '../timeline';
import { TRUTH, type TruthDay } from '../truth';

// Shapes follow Google Ads API GAQL search results (camelCase JSON).

export interface GoogleAdsRaw {
  customer: {
    resourceName: string;
    id: string;
    descriptiveName: string;
    currencyCode: string;
    timeZone: string;
    autoTaggingEnabled: boolean;
    conversionTrackingSetting: {
      conversionTrackingId: string;
      enhancedConversionsForLeadsEnabled: boolean;
      acceptedCustomerDataTerms: boolean;
    };
  };
  conversionActions: {
    resourceName: string;
    id: string;
    name: string;
    status: 'ENABLED' | 'REMOVED' | 'HIDDEN';
    type: 'WEBPAGE' | 'GOOGLE_ANALYTICS_4_CUSTOM' | 'UPLOAD_CLICKS';
    category: string;
    primaryForGoal: boolean;
    countingType: 'ONE_PER_CLICK' | 'MANY_PER_CLICK';
    valueSettings: { defaultValue: number; alwaysUseDefaultValue: boolean };
    tagSnippets?: { type: 'WEBPAGE'; eventSnippet: string }[];
    googleAnalytics4Settings?: { eventName: string; propertyName: string; propertyId: string };
  }[];
  offlineConversionUploadClientSummaries: {
    client: 'GOOGLE_ADS_API';
    conversionAction: string;
    status: 'EXCELLENT' | 'GOOD' | 'NEEDS_ATTENTION';
    lastUploadDateTime: string;
    successfulEventCount: string;
    totalEventCount: string;
  }[];
  campaigns: {
    resourceName: string;
    id: string;
    name: string;
    status: 'ENABLED' | 'PAUSED';
    advertisingChannelType: 'SEARCH' | 'PERFORMANCE_MAX' | 'DISPLAY';
    biddingStrategyType: string;
    campaignBudget: { amountMicros: string };
    conversionGoals: string[]; // conversion action resource names this campaign optimises for
  }[];
  campaignDaily: {
    campaign: { id: string };
    segments: { date: string };
    metrics: { costMicros: string; impressions: string; clicks: string; conversions: number };
  }[];
  conversionActionDaily: {
    segments: { date: string; conversionAction: string };
    metrics: { allConversions: number };
  }[];
  changeEvents: {
    resourceName: string;
    changeDateTime: string;
    userEmail: string;
    changeResourceType: 'CAMPAIGN_BUDGET' | 'CAMPAIGN' | 'CONVERSION_ACTION';
    changedFields: string;
    campaign?: string;
    oldResource: unknown;
    newResource: unknown;
  }[];
}

const CUSTOMER = 'customers/1234567890';
const ca = (id: string) => `${CUSTOMER}/conversionActions/${id}`;

const CAMPAIGNS = [
  { key: 'search_quotes', id: '20001', name: 'Search – Solar Quotes', type: 'SEARCH', bidding: 'MAXIMIZE_CONVERSIONS', budget: 420 },
  { key: 'search_brand', id: '20002', name: 'Search – Brand', type: 'SEARCH', bidding: 'TARGET_IMPRESSION_SHARE', budget: 60 },
  { key: 'pmax', id: '20003', name: 'PMax – Solar Leads', type: 'PERFORMANCE_MAX', bidding: 'MAXIMIZE_CONVERSIONS', budget: 200 },
] as const;

// Share of each campaign's clicks that converts, per business action.
const RATES: Record<(typeof CAMPAIGNS)[number]['key'], { quote: number; consult: number; phone: number }> = {
  search_quotes: { quote: 0.08, consult: 0.022, phone: 0.032 },
  search_brand: { quote: 0.12, consult: 0.03, phone: 0.05 },
  pmax: { quote: 0.04, consult: 0.01, phone: 0.015 },
};

function actionsForDay(day: TruthDay, i: number, key: (typeof CAMPAIGNS)[number]['key']) {
  const clicks = day.ads[key].clicks;
  const r = RATES[key];
  const quoteTracked = i >= BEATS.quoteTriggerBroken ? 0.1 : 1;
  const quote = clicks * r.quote;
  return {
    '1': quote * quoteTracked, // Quote Request (Ads tag)
    '2': quote * 0.92 * quoteTracked, // generate_lead (GA4 import)
    '3': i >= BEATS.consultKeyEventRemoved ? 0 : clicks * r.consult, // Consultation Booked (GA4 import)
    '4': clicks * r.phone * 1.7, // Phone Call Click — counts every click
    '5': i > BEATS.lastOfflineUpload ? 0 : quote * 0.24, // Qualified Lead (offline import)
  } as Record<string, number>;
}

const PRIMARY = new Set(['1', '2', '3', '5']);
const r1 = (x: number) => Math.round(x * 10) / 10;

function campaignDaily(): GoogleAdsRaw['campaignDaily'] {
  const rows: GoogleAdsRaw['campaignDaily'] = [];
  TRUTH.forEach((day, i) => {
    for (const c of CAMPAIGNS) {
      const d = day.ads[c.key];
      const conv = Object.entries(actionsForDay(day, i, c.key)).reduce((sum, [id, v]) => (PRIMARY.has(id) ? sum + v : sum), 0);
      rows.push({
        campaign: { id: c.id },
        segments: { date: day.date },
        metrics: { costMicros: String(Math.round(d.spend * 1e6)), impressions: String(d.impressions), clicks: String(d.clicks), conversions: r1(conv) },
      });
    }
  });
  return rows;
}

function conversionActionDaily(): GoogleAdsRaw['conversionActionDaily'] {
  const rows: GoogleAdsRaw['conversionActionDaily'] = [];
  TRUTH.forEach((day, i) => {
    const totals: Record<string, number> = {};
    for (const c of CAMPAIGNS) {
      for (const [id, v] of Object.entries(actionsForDay(day, i, c.key))) totals[id] = (totals[id] ?? 0) + v;
    }
    for (const [id, v] of Object.entries(totals)) rows.push({ segments: { date: day.date, conversionAction: ca(id) }, metrics: { allConversions: r1(v) } });
  });
  return rows;
}

const snippet = (label: string) => `gtag('event', 'conversion', {'send_to': 'AW-1122334455/${label}'});`;

export const googleAdsRaw: GoogleAdsRaw = {
  customer: {
    resourceName: CUSTOMER,
    id: '1234567890',
    descriptiveName: 'BrightPath Solar',
    currencyCode: 'USD',
    timeZone: 'America/Los_Angeles',
    autoTaggingEnabled: true,
    conversionTrackingSetting: { conversionTrackingId: '1122334455', enhancedConversionsForLeadsEnabled: true, acceptedCustomerDataTerms: true },
  },
  conversionActions: [
    {
      resourceName: ca('1'),
      id: '1',
      name: 'Quote Request',
      status: 'ENABLED',
      type: 'WEBPAGE',
      category: 'SUBMIT_LEAD_FORM',
      primaryForGoal: true,
      countingType: 'ONE_PER_CLICK',
      valueSettings: { defaultValue: 150, alwaysUseDefaultValue: true },
      tagSnippets: [{ type: 'WEBPAGE', eventSnippet: snippet('qR7xKp2LmN') }],
    },
    {
      resourceName: ca('2'),
      id: '2',
      name: 'generate_lead (GA4)',
      status: 'ENABLED',
      type: 'GOOGLE_ANALYTICS_4_CUSTOM',
      category: 'SUBMIT_LEAD_FORM',
      primaryForGoal: true,
      countingType: 'ONE_PER_CLICK',
      valueSettings: { defaultValue: 150, alwaysUseDefaultValue: true },
      googleAnalytics4Settings: { eventName: 'generate_lead', propertyName: 'BrightPath Solar – Web', propertyId: '412345678' },
    },
    {
      resourceName: ca('3'),
      id: '3',
      name: 'Consultation Booked',
      status: 'ENABLED',
      type: 'GOOGLE_ANALYTICS_4_CUSTOM',
      category: 'BOOK_APPOINTMENT',
      primaryForGoal: true,
      countingType: 'ONE_PER_CLICK',
      valueSettings: { defaultValue: 300, alwaysUseDefaultValue: true },
      googleAnalytics4Settings: { eventName: 'book_consultation', propertyName: 'BrightPath Solar – Web', propertyId: '412345678' },
    },
    {
      resourceName: ca('4'),
      id: '4',
      name: 'Phone Call Click',
      status: 'ENABLED',
      type: 'WEBPAGE',
      category: 'PHONE_CALL_LEAD',
      primaryForGoal: false,
      countingType: 'MANY_PER_CLICK',
      valueSettings: { defaultValue: 40, alwaysUseDefaultValue: true },
      tagSnippets: [{ type: 'WEBPAGE', eventSnippet: snippet('pH3cLk9QwE') }],
    },
    {
      resourceName: ca('5'),
      id: '5',
      name: 'Qualified Lead',
      status: 'ENABLED',
      type: 'UPLOAD_CLICKS',
      category: 'QUALIFIED_LEAD',
      primaryForGoal: true,
      countingType: 'ONE_PER_CLICK',
      valueSettings: { defaultValue: 1200, alwaysUseDefaultValue: false },
    },
  ],
  offlineConversionUploadClientSummaries: [
    {
      client: 'GOOGLE_ADS_API',
      conversionAction: ca('5'),
      status: 'NEEDS_ATTENTION',
      lastUploadDateTime: '2026-10-10 18:00:00',
      successfulEventCount: '412',
      totalEventCount: '431',
    },
  ],
  campaigns: CAMPAIGNS.map((c) => ({
    resourceName: `${CUSTOMER}/campaigns/${c.id}`,
    id: c.id,
    name: c.name,
    status: 'ENABLED' as const,
    advertisingChannelType: c.type,
    biddingStrategyType: c.bidding,
    campaignBudget: { amountMicros: String(c.budget * 1e6) },
    conversionGoals: c.key === 'pmax' ? [ca('1'), ca('5')] : [ca('1'), ca('2'), ca('3'), ca('5')],
  })),
  campaignDaily: campaignDaily(),
  conversionActionDaily: conversionActionDaily(),
  changeEvents: [
    {
      resourceName: `${CUSTOMER}/changeEvents/1758556800000~1`,
      changeDateTime: '2026-09-22 09:04:00',
      userEmail: 'alex@brightpathsolar.example',
      changeResourceType: 'CAMPAIGN_BUDGET',
      changedFields: 'amount_micros',
      campaign: `${CUSTOMER}/campaigns/20001`,
      oldResource: { campaignBudget: { amountMicros: '300000000' } },
      newResource: { campaignBudget: { amountMicros: '420000000' } },
    },
  ],
};
