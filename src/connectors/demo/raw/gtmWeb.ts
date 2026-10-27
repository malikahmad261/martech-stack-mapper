import { b, eq, regex, row, t, table, type GtmExport, type GtmTag } from './gtmFormat';

const ALL_PAGES = '2147479553';
const CONSENT_INIT = '2147479572';

const metaPixel = (tagId: string, name: string, eventName: string, triggerId: string, eventId: string): GtmTag => ({
  tagId,
  name,
  type: 'cvt_51955729_1',
  parameter: [t('pixelIds', '{{Const – Meta Pixel ID}}'), t('eventName', 'standard'), t('standardEventName', eventName), t('eventId', eventId)],
  firingTriggerId: [triggerId],
  consentSettings: { consentStatus: 'notSet' },
});

const ga4Event = (tagId: string, name: string, eventName: string, triggerId: string, params: [string, string][]): GtmTag => ({
  tagId,
  name,
  type: 'gaawe',
  parameter: [
    t('measurementIdOverride', '{{Const – GA4 Measurement ID}}'),
    t('eventName', eventName),
    table('eventSettingsTable', params.map(([k, v]) => row(k, v))),
  ],
  firingTriggerId: [triggerId],
  consentSettings: { consentStatus: 'notNeeded' },
});

export const gtmWebExport: GtmExport = {
  exportFormatVersion: 2,
  exportTime: '2026-10-27 06:00:12',
  containerVersion: {
    accountId: '6012345678',
    containerId: '170234561',
    containerVersionId: '47',
    name: 'v47 – New quote form vendor',
    container: { publicId: 'GTM-BPW7K2Q', name: 'brightpathsolar.example (web)', usageContext: ['WEB'] },
    tag: [
      {
        tagId: '1',
        name: 'Consent – Defaults (CMP)',
        type: 'cvt_88812345_7',
        parameter: [
          table('defaultSettings', [
            {
              type: 'map',
              map: [t('region', ''), t('ad_storage', 'denied'), t('analytics_storage', 'denied'), t('functionality_storage', 'granted'), t('security_storage', 'granted')],
            },
          ]),
          t('waitForUpdate', '500'),
          b('urlPassthrough', false),
          b('adsDataRedaction', true),
        ],
        firingTriggerId: [CONSENT_INIT],
        consentSettings: { consentStatus: 'notNeeded' },
      },
      {
        tagId: '2',
        name: 'Google tag – G-BP12XYZ9QK',
        type: 'googtag',
        parameter: [
          t('tagId', '{{Const – GA4 Measurement ID}}'),
          table('configSettingsTable', [row('server_container_url', '{{Const – sGTM URL}}'), row('send_page_view', 'true')]),
        ],
        firingTriggerId: [ALL_PAGES],
        consentSettings: { consentStatus: 'notNeeded' },
      },
      ga4Event('3', 'GA4 – generate_lead', 'generate_lead', '3', [
        ['event_id', '{{DLV – event_id}}'],
        ['lead_type', '{{DLV – lead_type}}'],
        ['user_data', '{{UPD – Lead form}}'],
      ]),
      ga4Event('4', 'GA4 – book_consultation', 'book_consultation', '4', [
        ['event_id', '{{DLV – event_id}}'],
        ['user_data', '{{UPD – Lead form}}'],
      ]),
      ga4Event('5', 'GA4 – phone_call_click', 'phone_call_click', '5', [['event_id', '{{DLV – event_id}}']]),
      ga4Event('6', 'GA4 – sign_up', 'sign_up', '6', [
        ['event_id', '{{DLV – event_id}}'],
        ['user_data', '{{UPD – Lead form}}'],
      ]),
      {
        tagId: '7',
        name: 'Ads – Conversion Linker',
        type: 'gclidw',
        parameter: [b('enableCrossDomain', false), b('enableUrlPassthrough', false), b('enableCookieOverrides', false)],
        firingTriggerId: ['7'],
        consentSettings: { consentStatus: 'notNeeded' },
      },
      {
        tagId: '8',
        name: 'Ads – Quote Request',
        type: 'awct',
        parameter: [t('conversionId', '1122334455'), t('conversionLabel', 'qR7xKp2LmN'), t('orderId', '{{DLV – event_id}}'), b('enableEnhancedConversion', false)],
        firingTriggerId: ['3'],
        consentSettings: { consentStatus: 'notNeeded' },
      },
      {
        tagId: '9',
        name: 'Ads – Phone Call Click',
        type: 'awct',
        parameter: [t('conversionId', '1122334455'), t('conversionLabel', 'pH3cLk9QwE'), b('enableEnhancedConversion', false)],
        firingTriggerId: ['5'],
        consentSettings: { consentStatus: 'notNeeded' },
      },
      {
        tagId: '10',
        name: 'Ads – Newsletter (old)',
        type: 'awct',
        parameter: [t('conversionId', '1122334455'), t('conversionLabel', 'nWs0Ld4XyZ'), b('enableEnhancedConversion', false)],
        firingTriggerId: ['31'],
        consentSettings: { consentStatus: 'notNeeded' },
      },
      {
        tagId: '11',
        name: 'Meta – Pixel Base',
        type: 'cvt_51955729_1',
        parameter: [t('pixelIds', '{{Const – Meta Pixel ID}}'), t('eventName', 'standard'), t('standardEventName', 'PageView'), t('eventId', '')],
        firingTriggerId: [ALL_PAGES],
        consentSettings: { consentStatus: 'notSet' },
      },
      metaPixel('12', 'Meta – Lead', 'Lead', '3', ''),
      metaPixel('13', 'Meta – Schedule', 'Schedule', '4', '{{DLV – event_id}}'),
      metaPixel('14', 'Meta – Contact', 'Contact', '5', '{{DLV – event_id}}'),
      metaPixel('15', 'Meta – CompleteRegistration', 'CompleteRegistration', '6', '{{DLV – event_id}}'),
    ],
    trigger: [
      { triggerId: ALL_PAGES, name: 'All Pages', type: 'PAGEVIEW' },
      { triggerId: CONSENT_INIT, name: 'Consent Initialization – All Pages', type: 'CONSENT_INIT' },
      { triggerId: '3', name: 'CE – quote_submit', type: 'CUSTOM_EVENT', customEventFilter: [eq('{{_event}}', 'quote_submitted')] },
      { triggerId: '4', name: 'CE – consult_booked', type: 'CUSTOM_EVENT', customEventFilter: [eq('{{_event}}', 'consult_booked')] },
      { triggerId: '5', name: 'CE – phone_click', type: 'CUSTOM_EVENT', customEventFilter: [eq('{{_event}}', 'phone_click')] },
      { triggerId: '6', name: 'CE – newsletter_signup', type: 'CUSTOM_EVENT', customEventFilter: [eq('{{_event}}', 'newsletter_signup')] },
      { triggerId: '7', name: 'Page View – Landing pages', type: 'PAGEVIEW', filter: [regex('{{Page Path}}', '^/(lp|offers)/')] },
    ],
    variable: [
      { variableId: '1', name: 'DLV – event_id', type: 'v', parameter: [t('name', 'event_id'), t('dataLayerVersion', '2')] },
      { variableId: '2', name: 'DLV – user_data.email', type: 'v', parameter: [t('name', 'user_data.email'), t('dataLayerVersion', '2')] },
      { variableId: '3', name: 'DLV – user_data.phone', type: 'v', parameter: [t('name', 'user_data.phone'), t('dataLayerVersion', '2')] },
      { variableId: '4', name: 'DLV – lead_type', type: 'v', parameter: [t('name', 'lead_type'), t('dataLayerVersion', '2')] },
      { variableId: '5', name: 'Const – GA4 Measurement ID', type: 'c', parameter: [t('value', 'G-BP12XYZ9QK')] },
      { variableId: '6', name: 'Const – Meta Pixel ID', type: 'c', parameter: [t('value', '887766554433221')] },
      { variableId: '7', name: 'Const – sGTM URL', type: 'c', parameter: [t('value', 'https://sgtm.brightpathsolar.example')] },
      {
        variableId: '8',
        name: 'UPD – Lead form',
        type: 'awec',
        parameter: [t('mode', 'MANUAL'), t('email', '{{DLV – user_data.email}}'), t('phone_number', '{{DLV – user_data.phone}}')],
      },
    ],
  },
  versionHistory: [
    {
      containerVersionId: '45',
      name: 'v45 – Phone click tracking',
      description: 'Add phone_click trigger, GA4 + Ads + Meta tags',
      publishedAt: '2026-08-19T17:20:00Z',
      publishedBy: 'jamie@brightpathsolar.example',
      changes: [{ entityType: 'tag', entityId: '9', name: 'Ads – Phone Call Click', field: 'created', before: null, after: 'awct' }],
    },
    {
      containerVersionId: '46',
      name: 'v46 – Retire old newsletter form',
      description: 'Delete trigger "CE – newsletter_legacy"',
      publishedAt: '2026-09-09T16:05:00Z',
      publishedBy: 'jamie@brightpathsolar.example',
      changes: [{ entityType: 'trigger', entityId: '31', name: 'CE – newsletter_legacy', field: 'deleted', before: 'newsletter_legacy', after: null }],
    },
    {
      containerVersionId: '47',
      name: 'v47 – New quote form vendor',
      description: 'Rename form events for the new form vendor',
      publishedAt: '2026-10-18T15:42:00Z',
      publishedBy: 'jamie@brightpathsolar.example',
      changes: [{ entityType: 'trigger', entityId: '3', name: 'CE – quote_submit', field: 'customEventName', before: 'quote_submit', after: 'quote_submitted' }],
    },
  ],
};
