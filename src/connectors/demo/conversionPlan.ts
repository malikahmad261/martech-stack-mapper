// The client's conversion plan: the business conversions that matter and what each one is called
// on every platform (docs/REQUIREMENTS.md §4.2). It is set up once per client during onboarding —
// like a tracking plan — rather than inferred, because inference fails exactly when tracking breaks
// (a trigger listening for the wrong event no longer connects the site event to anything).

export interface PlannedConversion {
  id: string;
  label: string;
  description: string;
  /** dataLayer event that starts it; absent for conversions that arrive offline. */
  datalayerEvent?: string;
  ga4Event?: string;
  /** Google Ads conversion action names. More than one means the same lead is reported twice. */
  googleAdsActions: string[];
  metaEvent?: string;
  metaCustomConversion?: string;
}

export const CONVERSION_PLAN: PlannedConversion[] = [
  {
    id: 'quote',
    label: 'Quote request',
    description: 'Someone submits the quote form',
    datalayerEvent: 'quote_submit',
    ga4Event: 'generate_lead',
    googleAdsActions: ['Quote Request', 'generate_lead (GA4)'],
    metaEvent: 'Lead',
  },
  {
    id: 'consult',
    label: 'Consultation booked',
    description: 'Someone books a consultation in the scheduler',
    datalayerEvent: 'consult_booked',
    ga4Event: 'book_consultation',
    googleAdsActions: ['Consultation Booked'],
    metaEvent: 'Schedule',
  },
  {
    id: 'phone',
    label: 'Phone call click',
    description: 'Someone taps the phone number',
    datalayerEvent: 'phone_click',
    ga4Event: 'phone_call_click',
    googleAdsActions: ['Phone Call Click'],
    metaEvent: 'Contact',
  },
  {
    id: 'newsletter',
    label: 'Newsletter signup',
    description: 'Someone joins the newsletter',
    datalayerEvent: 'newsletter_signup',
    ga4Event: 'sign_up',
    googleAdsActions: [],
    metaEvent: 'CompleteRegistration',
  },
  {
    id: 'qualified',
    label: 'Qualified lead',
    description: 'Sales marks a lead as qualified in the CRM (uploaded offline)',
    googleAdsActions: ['Qualified Lead'],
    metaCustomConversion: 'Qualified Lead (form)',
  },
];
