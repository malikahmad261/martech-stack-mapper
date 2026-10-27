import { BEATS } from '../timeline';
import { TRUTH } from '../truth';

// Shapes follow the Analytics Admin API (v1beta) and Data API runReport rows.

export interface Ga4Raw {
  account: { name: string; displayName: string };
  property: { name: string; displayName: string; timeZone: string; currencyCode: string; industryCategory: string };
  dataStreams: { name: string; type: 'WEB_DATA_STREAM'; displayName: string; webStreamData: { measurementId: string; defaultUri: string } }[];
  keyEvents: { name: string; eventName: string; countingMethod: 'ONCE_PER_EVENT' | 'ONCE_PER_SESSION'; createTime: string }[];
  customDimensions: { name: string; parameterName: string; displayName: string; scope: 'EVENT' | 'USER' }[];
  googleAdsLinks: { name: string; customerId: string; adsPersonalizationEnabled: boolean; createTime: string }[];
  dataRetentionSettings: { eventDataRetention: string };
  changeHistoryEvents: {
    id: string;
    changeTime: string;
    actorType: 'USER' | 'SYSTEM';
    userActorEmail: string;
    changes: { resource: string; action: 'CREATED' | 'UPDATED' | 'DELETED'; resourceBeforeChange?: unknown; resourceAfterChange?: unknown }[];
  }[];
  reports: {
    eventsLast28Days: { dimensionValues: [string]; metricValues: [string] }[];
    dailyEvents: { dimensionValues: [string, string]; metricValues: [string] }[]; // [date, eventName] → eventCount
    dailyChannels: { dimensionValues: [string, string]; metricValues: [string, string] }[]; // [date, channel] → sessions, engagedSessions
  };
}

const ymd = (date: string) => date.replaceAll('-', '');

function dailyEvents() {
  const rows: Ga4Raw['reports']['dailyEvents'] = [];
  TRUTH.forEach((day, i) => {
    const quoteTracked = i >= BEATS.quoteTriggerBroken ? 0.1 : 1;
    const counts: Record<string, number> = {
      generate_lead: Math.round((day.quotes + day.spamQuotes) * quoteTracked),
      book_consultation: day.consults,
      phone_call_click: day.phoneClicks,
      sign_up: day.signups,
    };
    for (const [eventName, n] of Object.entries(counts)) rows.push({ dimensionValues: [ymd(day.date), eventName], metricValues: [String(n)] });
  });
  return rows;
}

function dailyChannels() {
  const rows: Ga4Raw['reports']['dailyChannels'] = [];
  for (const day of TRUTH) {
    for (const channel of Object.keys(day.sessions) as (keyof typeof day.sessions)[]) {
      rows.push({ dimensionValues: [ymd(day.date), channel], metricValues: [String(day.sessions[channel]), String(day.engagedSessions[channel])] });
    }
  }
  return rows;
}

function last28(eventName: string, perDay: (i: number) => number) {
  let total = 0;
  for (let i = TRUTH.length - 28; i < TRUTH.length; i++) total += perDay(i);
  return { dimensionValues: [eventName] as [string], metricValues: [String(Math.round(total))] as [string] };
}

const sessions = (i: number) => Object.values(TRUTH[i].sessions).reduce((a, b) => a + b, 0);

export const ga4Raw: Ga4Raw = {
  account: { name: 'accounts/90817263', displayName: 'BrightPath Solar' },
  property: {
    name: 'properties/412345678',
    displayName: 'BrightPath Solar – Web',
    timeZone: 'America/Los_Angeles',
    currencyCode: 'USD',
    industryCategory: 'HOME_AND_GARDEN',
  },
  dataStreams: [
    {
      name: 'properties/412345678/dataStreams/5566778899',
      type: 'WEB_DATA_STREAM',
      displayName: 'brightpathsolar.example',
      webStreamData: { measurementId: 'G-BP12XYZ9QK', defaultUri: 'https://www.brightpathsolar.example' },
    },
  ],
  keyEvents: [
    { name: 'properties/412345678/keyEvents/1001', eventName: 'generate_lead', countingMethod: 'ONCE_PER_EVENT', createTime: '2025-03-04T10:00:00Z' },
    { name: 'properties/412345678/keyEvents/1003', eventName: 'phone_call_click', countingMethod: 'ONCE_PER_EVENT', createTime: '2026-08-19T18:00:00Z' },
  ],
  customDimensions: [
    { name: 'properties/412345678/customDimensions/1', parameterName: 'lead_type', displayName: 'Lead type', scope: 'EVENT' },
    { name: 'properties/412345678/customDimensions/2', parameterName: 'form_vendor', displayName: 'Form vendor', scope: 'EVENT' },
    { name: 'properties/412345678/customDimensions/3', parameterName: 'page_template', displayName: 'Page template', scope: 'EVENT' },
    { name: 'properties/412345678/customDimensions/4', parameterName: 'customer_status', displayName: 'Customer status', scope: 'USER' },
  ],
  googleAdsLinks: [
    { name: 'properties/412345678/googleAdsLinks/7781', customerId: '1234567890', adsPersonalizationEnabled: true, createTime: '2025-03-04T10:30:00Z' },
  ],
  dataRetentionSettings: { eventDataRetention: 'FOURTEEN_MONTHS' },
  changeHistoryEvents: [
    {
      id: 'ch-20261006-1',
      changeTime: '2026-10-06T15:12:00Z',
      actorType: 'USER',
      userActorEmail: 'sam@agency.example',
      changes: [
        {
          resource: 'properties/412345678/keyEvents/1002',
          action: 'DELETED',
          resourceBeforeChange: { keyEvent: { eventName: 'book_consultation', countingMethod: 'ONCE_PER_EVENT' } },
        },
      ],
    },
    {
      id: 'ch-20260819-1',
      changeTime: '2026-08-19T18:00:00Z',
      actorType: 'USER',
      userActorEmail: 'jamie@brightpathsolar.example',
      changes: [
        {
          resource: 'properties/412345678/keyEvents/1003',
          action: 'CREATED',
          resourceAfterChange: { keyEvent: { eventName: 'phone_call_click', countingMethod: 'ONCE_PER_EVENT' } },
        },
      ],
    },
  ],
  reports: {
    eventsLast28Days: [
      last28('page_view', (i) => sessions(i) * 2.4),
      last28('session_start', sessions),
      last28('user_engagement', (i) => sessions(i) * 1.3),
      last28('scroll', (i) => sessions(i) * 0.9),
      last28('form_start', (i) => TRUTH[i].quotes * 2.8),
      last28('generate_lead', (i) => (TRUTH[i].quotes + TRUTH[i].spamQuotes) * (i >= BEATS.quoteTriggerBroken ? 0.1 : 1)),
      last28('book_consultation', (i) => TRUTH[i].consults),
      last28('phone_call_click', (i) => TRUTH[i].phoneClicks),
      last28('sign_up', (i) => TRUTH[i].signups),
    ],
    dailyEvents: dailyEvents(),
    dailyChannels: dailyChannels(),
  },
};
