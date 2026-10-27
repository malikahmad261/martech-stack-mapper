import { eq, row, t, table, type GtmExport, type GtmTag } from './gtmFormat';

const capi = (tagId: string, name: string, eventName: string, triggerId: string, userData: [string, string][]): GtmTag => ({
  tagId,
  name,
  type: 'cvt_20230417_3',
  parameter: [
    t('pixelId', '{{Const – Meta Pixel ID}}'),
    t('apiAccessToken', '{{Const – CAPI Token}}'),
    t('eventName', 'override'),
    t('eventNameOverride', eventName),
    t('eventId', '{{ED – event_id}}'),
    t('actionSource', 'website'),
    table('userDataList', userData.map(([k, v]) => row(k, v, 'name', 'value'))),
  ],
  firingTriggerId: [triggerId],
});

export const gtmServerExport: GtmExport = {
  exportFormatVersion: 2,
  exportTime: '2026-10-27 06:00:14',
  containerVersion: {
    accountId: '6012345678',
    containerId: '170234599',
    containerVersionId: '13',
    name: 'v13 – Revert CAPI Schedule pixel',
    container: {
      publicId: 'GTM-BPS4N9R',
      name: 'sgtm.brightpathsolar.example (server)',
      usageContext: ['SERVER'],
      taggingServerUrls: ['https://sgtm.brightpathsolar.example'],
    },
    client: [
      {
        clientId: '1',
        name: 'GA4',
        type: 'gaaw_client',
        priority: 10,
        parameter: [t('cookieManagement', 'server'), t('cookieName', 'FPID'), t('cookieDomain', 'auto'), t('cookieMaxAgeInSec', '63072000')],
      },
    ],
    tag: [
      {
        tagId: '1',
        name: 'GA4 – Forward to property',
        type: 'sgtmgaaw',
        parameter: [t('measurementId', 'G-BP12XYZ9QK'), t('redactVisitorIp', 'false')],
        firingTriggerId: ['1'],
      },
      capi('2', 'Meta CAPI – Lead', 'Lead', '2', [
        ['client_ip_address', '{{ED – ip_override}}'],
        ['client_user_agent', '{{ED – user_agent}}'],
      ]),
      capi('3', 'Meta CAPI – Schedule', 'Schedule', '3', [
        ['em', '{{ED – user_data.email_address}}'],
        ['ph', '{{ED – user_data.phone_number}}'],
        ['client_ip_address', '{{ED – ip_override}}'],
        ['client_user_agent', '{{ED – user_agent}}'],
      ]),
      capi('4', 'Meta CAPI – CompleteRegistration', 'CompleteRegistration', '4', [
        ['em', '{{ED – user_data.email_address}}'],
        ['client_ip_address', '{{ED – ip_override}}'],
        ['client_user_agent', '{{ED – user_agent}}'],
      ]),
    ],
    trigger: [
      { triggerId: '1', name: 'GA4 – All events', type: 'ALWAYS', filter: [eq('{{Client Name}}', 'GA4')] },
      { triggerId: '2', name: 'GA4 – generate_lead', type: 'CUSTOM', filter: [eq('{{Client Name}}', 'GA4'), eq('{{Event Name}}', 'generate_lead')] },
      { triggerId: '3', name: 'GA4 – book_consultation', type: 'CUSTOM', filter: [eq('{{Client Name}}', 'GA4'), eq('{{Event Name}}', 'book_consultation')] },
      { triggerId: '4', name: 'GA4 – sign_up', type: 'CUSTOM', filter: [eq('{{Client Name}}', 'GA4'), eq('{{Event Name}}', 'sign_up')] },
    ],
    variable: [
      { variableId: '1', name: 'ED – event_id', type: 'ed', parameter: [t('keyPath', 'event_id')] },
      { variableId: '2', name: 'ED – user_data.email_address', type: 'ed', parameter: [t('keyPath', 'user_data.email_address')] },
      { variableId: '3', name: 'ED – user_data.phone_number', type: 'ed', parameter: [t('keyPath', 'user_data.phone_number')] },
      { variableId: '4', name: 'ED – fbc', type: 'ed', parameter: [t('keyPath', 'x-fb-ck-fbc')] },
      { variableId: '5', name: 'ED – fbp', type: 'ed', parameter: [t('keyPath', 'x-fb-ck-fbp')] },
      { variableId: '6', name: 'ED – ip_override', type: 'ed', parameter: [t('keyPath', 'ip_override')] },
      { variableId: '7', name: 'ED – user_agent', type: 'ed', parameter: [t('keyPath', 'user_agent')] },
      { variableId: '8', name: 'Const – Meta Pixel ID', type: 'c', parameter: [t('value', '887766554433221')] },
      { variableId: '9', name: 'Const – CAPI Token', type: 'c', parameter: [t('value', '••••••••')] },
    ],
  },
  versionHistory: [
    {
      containerVersionId: '11',
      name: 'v11 – CAPI for sign_up',
      description: 'Add Meta CAPI – CompleteRegistration',
      publishedAt: '2026-08-28T19:10:00Z',
      publishedBy: 'sam@agency.example',
      changes: [{ entityType: 'tag', entityId: '4', name: 'Meta CAPI – CompleteRegistration', field: 'created', before: null, after: 'cvt_20230417_3' }],
    },
    {
      containerVersionId: '12',
      name: 'v12 – Pixel ID clean-up',
      description: 'Use pixel ID variable everywhere',
      publishedAt: '2026-09-27T09:30:00Z',
      publishedBy: 'sam@agency.example',
      changes: [{ entityType: 'tag', entityId: '3', name: 'Meta CAPI – Schedule', field: 'pixelId', before: '887766554433221', after: '{{Const – Pixel ID}}' }],
    },
    {
      containerVersionId: '13',
      name: 'v13 – Revert CAPI Schedule pixel',
      description: 'v12 referenced a variable that does not exist; revert',
      publishedAt: '2026-09-30T08:15:00Z',
      publishedBy: 'sam@agency.example',
      changes: [{ entityType: 'tag', entityId: '3', name: 'Meta CAPI – Schedule', field: 'pixelId', before: '{{Const – Pixel ID}}', after: '{{Const – Meta Pixel ID}}' }],
    },
  ],
};
