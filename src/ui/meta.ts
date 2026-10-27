import type { AnomalyType, EntityKind, Health, IssueCategory, Severity, ToolId } from '../model/schema';

export const TOOL_ORDER: ToolId[] = ['site', 'gtm_web', 'gtm_server', 'ga4', 'google_ads', 'meta'];

export const TOOLS: Record<ToolId, { label: string; short: string; color: string; bg: string; text: string; ring: string }> = {
  site: { label: 'Website', short: 'Site', color: '#64748b', bg: 'bg-slate-100', text: 'text-slate-700', ring: 'ring-slate-300' },
  gtm_web: { label: 'GTM Web', short: 'GTM Web', color: '#2563eb', bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-200' },
  gtm_server: { label: 'GTM Server', short: 'GTM Server', color: '#0891b2', bg: 'bg-cyan-50', text: 'text-cyan-700', ring: 'ring-cyan-200' },
  ga4: { label: 'Google Analytics 4', short: 'GA4', color: '#ea580c', bg: 'bg-orange-50', text: 'text-orange-700', ring: 'ring-orange-200' },
  google_ads: { label: 'Google Ads', short: 'Google Ads', color: '#059669', bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200' },
  meta: { label: 'Meta Ads', short: 'Meta', color: '#7c3aed', bg: 'bg-violet-50', text: 'text-violet-700', ring: 'ring-violet-200' },
};

export const HEALTH: Record<Health, { label: string; dot: string; badge: string; stroke: string }> = {
  healthy: { label: 'Healthy', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', stroke: '#10b981' },
  degraded: { label: 'Degraded', dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-800 ring-amber-200', stroke: '#f59e0b' },
  broken: { label: 'Broken', dot: 'bg-rose-500', badge: 'bg-rose-50 text-rose-700 ring-rose-200', stroke: '#f43f5e' },
  inactive: { label: 'Inactive', dot: 'bg-slate-300', badge: 'bg-slate-100 text-slate-500 ring-slate-200', stroke: '#cbd5e1' },
  unknown: { label: 'Unknown', dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600 ring-slate-200', stroke: '#94a3b8' },
};

export const SEVERITY: Record<Severity, { label: string; badge: string; weight: number }> = {
  critical: { label: 'Critical', badge: 'bg-rose-600 text-white ring-rose-600', weight: 8 },
  high: { label: 'High', badge: 'bg-rose-50 text-rose-700 ring-rose-200', weight: 5 },
  medium: { label: 'Medium', badge: 'bg-amber-50 text-amber-800 ring-amber-200', weight: 2 },
  low: { label: 'Low', badge: 'bg-slate-100 text-slate-600 ring-slate-200', weight: 1 },
};

export const CATEGORY: Record<IssueCategory, string> = {
  conversion_tracking: 'Conversion tracking',
  cookies_click_ids: 'Cookies & click IDs',
  consent: 'Consent',
  configuration: 'Configuration & linking',
  data_quality: 'Data quality',
};

export const ANOMALY: Record<AnomalyType, { label: string; short: string; description: string; badge: string; color: string }> = {
  spend_driven: {
    label: 'Spend-driven',
    short: 'Spend',
    description: 'Traffic or conversion changes explained by a change in spend or budget. Usually expected.',
    badge: 'bg-sky-50 text-sky-700 ring-sky-200',
    color: '#0284c7',
  },
  tracking_outage: {
    label: 'Tracking outage',
    short: 'Outage',
    description: 'Conversions or events moved because tracking changed or broke, while traffic held steady.',
    badge: 'bg-rose-50 text-rose-700 ring-rose-200',
    color: '#e11d48',
  },
  bot_traffic: {
    label: 'Bot / invalid traffic',
    short: 'Bot traffic',
    description: 'Artificial increases from non-human or junk traffic: clicks without matching spend or engagement.',
    badge: 'bg-amber-50 text-amber-800 ring-amber-200',
    color: '#d97706',
  },
};

export const KIND_LABEL: Record<EntityKind, string> = {
  datalayer_event: 'dataLayer event',
  gtm_container: 'Container',
  gtm_tag: 'Tag',
  gtm_trigger: 'Trigger',
  gtm_variable: 'Variable',
  gtm_client: 'Client',
  ga4_property: 'Property',
  ga4_stream: 'Data stream',
  ga4_event: 'Event',
  ga4_custom_dimension: 'Custom dimension',
  ga4_link: 'Product link',
  gads_account: 'Account',
  gads_conversion_action: 'Conversion action',
  gads_campaign: 'Campaign',
  meta_ad_account: 'Ad account',
  meta_dataset: 'Dataset (Pixel)',
  meta_event: 'Event',
  meta_custom_conversion: 'Custom conversion',
  meta_campaign: 'Campaign',
};

export const TAG_TYPE_LABEL: Record<string, string> = {
  google_tag: 'Google tag',
  ga4_event: 'GA4 event',
  ads_conversion: 'Google Ads conversion',
  conversion_linker: 'Conversion Linker',
  consent_defaults: 'Consent defaults (CMP)',
  meta_pixel: 'Meta Pixel',
  ga4_server: 'GA4 (server)',
  meta_capi: 'Meta Conversions API',
  custom: 'Custom',
};

export const FIELD_LABELS: Record<string, string> = {
  firingTriggerIds: 'Firing triggers',
  customEventName: 'Event name',
  measurementId: 'Measurement ID',
  serverContainerUrl: 'server_container_url',
  eventName: 'Event name',
  eventId: 'Event ID',
  userData: 'User data',
  primaryForGoal: 'Primary',
  countingType: 'Count',
  isKeyEvent: 'Key event',
  countingMethod: 'Counting method',
};

export function toolPath(tool: ToolId) {
  return `/tools/${tool}`;
}

export function entityPath(tool: ToolId, entityId: string) {
  return `/tools/${tool}?entity=${encodeURIComponent(entityId)}`;
}

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
export const fmtPct = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%`;
export const fmtNum = (n: number) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('en-US') : String(Math.round(n * 10) / 10));
