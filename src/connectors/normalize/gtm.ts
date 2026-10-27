import type { ChangeEvent, Entity, Tool } from '../../model/schema';
import type { GtmCondition, GtmExport, GtmParameter, GtmTag } from '../demo/raw/gtmFormat';

type GtmTool = 'gtm_web' | 'gtm_server';

const TAG_TYPES: Record<string, string> = {
  googtag: 'google_tag',
  gaawe: 'ga4_event',
  awct: 'ads_conversion',
  gclidw: 'conversion_linker',
  sgtmgaaw: 'ga4_server',
  cvt_51955729_1: 'meta_pixel',
  cvt_20230417_3: 'meta_capi',
  cvt_88812345_7: 'consent_defaults',
};

const VARIABLE_TYPES: Record<string, string> = {
  v: 'Data Layer Variable',
  c: 'Constant',
  awec: 'User-Provided Data',
  ed: 'Event Data',
  k: '1st-Party Cookie',
};

const TRIGGER_TYPES: Record<string, string> = {
  PAGEVIEW: 'Page View',
  CONSENT_INIT: 'Consent Initialization',
  CUSTOM_EVENT: 'Custom Event',
  ALWAYS: 'Custom (all events)',
  CUSTOM: 'Custom',
};

function param(params: GtmParameter[], key: string): string | undefined {
  return params.find((p) => p.key === key)?.value;
}

function tableRows(params: GtmParameter[], key: string, nameKey = 'parameter', valueKey = 'parameterValue'): Record<string, string> {
  const list = params.find((p) => p.key === key)?.list ?? [];
  const out: Record<string, string> = {};
  for (const r of list) {
    const name = r.map?.find((m) => m.key === nameKey)?.value;
    const value = r.map?.find((m) => m.key === valueKey)?.value;
    if (name) out[name] = value ?? '';
  }
  return out;
}

function conditions(list: GtmCondition[] | undefined) {
  return (list ?? []).map((c) => ({
    variable: c.parameter.find((p) => p.key === 'arg0')?.value ?? '',
    operator: c.type,
    value: c.parameter.find((p) => p.key === 'arg1')?.value ?? '',
  }));
}

export function normalizeGtm(tool: GtmTool, raw: GtmExport, snapshotId: string): { tool: Tool; entities: Entity[]; changeEvents: ChangeEvent[] } {
  const cv = raw.containerVersion;
  const ref = (path: string) => ({ snapshotId, path });
  const constants = new Map(cv.variable.filter((v) => v.type === 'c').map((v) => [v.name, param(v.parameter, 'value') ?? '']));
  const resolve = (value: string | undefined) =>
    (value ?? '').replace(/\{\{([^}]+)\}\}/g, (m, name: string) => constants.get(name) ?? m);

  const entities: Entity[] = [];
  const containerId = `${tool}:container:${cv.container.publicId}`;
  const latest = raw.versionHistory.find((v) => v.containerVersionId === cv.containerVersionId);

  entities.push({
    id: containerId,
    tool,
    kind: 'gtm_container',
    externalId: cv.container.publicId,
    name: cv.container.name,
    status: 'active',
    config: {
      publicId: cv.container.publicId,
      liveVersion: Number(cv.containerVersionId),
      liveVersionName: cv.name,
      usageContext: cv.container.usageContext.join(', '),
      taggingServerUrl: cv.container.taggingServerUrls?.[0],
    },
    health: 'unknown',
    sourceRef: ref('containerVersion.container'),
  });

  cv.variable.forEach((v, i) => {
    const params = Object.fromEntries(v.parameter.filter((p) => p.key).map((p) => [p.key!, p.value ?? '']));
    entities.push({
      id: `${tool}:variable:${v.variableId}`,
      tool,
      kind: 'gtm_variable',
      externalId: v.variableId,
      name: v.name,
      status: 'active',
      config: { variableType: VARIABLE_TYPES[v.type] ?? v.type, ...params },
      health: 'unknown',
      sourceRef: ref(`containerVersion.variable[${i}]`),
    });
  });

  cv.trigger.forEach((tr, i) => {
    const filters = conditions(tr.filter);
    const custom = conditions(tr.customEventFilter);
    entities.push({
      id: `${tool}:trigger:${tr.triggerId}`,
      tool,
      kind: 'gtm_trigger',
      externalId: tr.triggerId,
      name: tr.name,
      status: 'active',
      config: {
        triggerType: TRIGGER_TYPES[tr.type] ?? tr.type,
        customEventName: custom.find((c) => c.variable === '{{_event}}')?.value,
        clientName: filters.find((c) => c.variable === '{{Client Name}}')?.value,
        eventName: filters.find((c) => c.variable === '{{Event Name}}')?.value,
        conditions: filters
          .filter((c) => c.variable !== '{{Client Name}}' && c.variable !== '{{Event Name}}')
          .map((c) => `${c.variable} ${c.operator === 'MATCH_REGEX' ? 'matches' : 'equals'} ${c.value}`)
          .join('; '),
      },
      health: 'unknown',
      sourceRef: ref(`containerVersion.trigger[${i}]`),
    });
  });

  cv.tag.forEach((tag, i) => {
    entities.push({
      id: `${tool}:tag:${tag.tagId}`,
      tool,
      kind: 'gtm_tag',
      externalId: tag.tagId,
      name: tag.name,
      status: tag.paused ? 'paused' : 'active',
      config: tagConfig(tool, tag, resolve),
      health: 'unknown',
      sourceRef: ref(`containerVersion.tag[${i}]`),
    });
  });

  (cv.client ?? []).forEach((c, i) => {
    entities.push({
      id: `${tool}:client:${c.clientId}`,
      tool,
      kind: 'gtm_client',
      externalId: c.clientId,
      name: c.name,
      status: 'active',
      config: {
        clientType: c.type === 'gaaw_client' ? 'GA4' : c.type,
        priority: c.priority,
        cookieManagement: param(c.parameter, 'cookieManagement'),
        cookieName: param(c.parameter, 'cookieName'),
        cookieDomain: param(c.parameter, 'cookieDomain'),
      },
      health: 'unknown',
      sourceRef: ref(`containerVersion.client[${i}]`),
    });
  });

  const changeEvents: ChangeEvent[] = raw.versionHistory.map((v) => ({
    id: `${tool}:version:${v.containerVersionId}`,
    tool,
    at: v.publishedAt,
    actor: v.publishedBy,
    kind: 'gtm_publish',
    summary: `Published ${v.name} — ${v.description}`,
    entityIds: [containerId, ...v.changes.map((c) => `${tool}:${c.entityType}:${c.entityId}`)],
    before: v.changes.map((c) => ({ entity: c.name, field: c.field, value: c.before })),
    after: v.changes.map((c) => ({ entity: c.name, field: c.field, value: c.after })),
  }));

  const googleTag = entities.find((e) => e.kind === 'gtm_tag' && e.config.tagType === 'google_tag');
  return {
    tool: {
      id: tool,
      name: tool === 'gtm_web' ? 'GTM Web' : 'GTM Server',
      externalId: cv.container.publicId,
      settings: {
        liveVersion: Number(cv.containerVersionId),
        liveVersionName: cv.name,
        publishedAt: latest?.publishedAt,
        publishedBy: latest?.publishedBy,
        ...(tool === 'gtm_web'
          ? { serverContainerUrl: googleTag?.config.serverContainerUrl ?? null }
          : { taggingServerUrl: cv.container.taggingServerUrls?.[0] }),
      },
      lastChangedAt: latest?.publishedAt,
    },
    entities,
    changeEvents,
  };
}

function tagConfig(tool: GtmTool, tag: GtmTag, resolve: (v: string | undefined) => string): Record<string, unknown> {
  const p = tag.parameter;
  const tagType = TAG_TYPES[tag.type] ?? 'custom';
  const base: Record<string, unknown> = {
    tagType,
    templateType: tag.type,
    firingTriggerIds: tag.firingTriggerId.map((id) => `${tool}:trigger:${id}`),
    paused: !!tag.paused,
  };
  if (tool === 'gtm_web') {
    const status = tag.consentSettings?.consentStatus ?? 'notSet';
    base.consent = { status, types: '' };
  }

  switch (tagType) {
    case 'google_tag': {
      const settings = tableRows(p, 'configSettingsTable');
      return {
        ...base,
        measurementIdRef: param(p, 'tagId'),
        measurementId: resolve(param(p, 'tagId')),
        serverContainerUrl: settings.server_container_url ? resolve(settings.server_container_url) : '',
        sendPageView: settings.send_page_view !== 'false',
      };
    }
    case 'ga4_event': {
      const eventParams = tableRows(p, 'eventSettingsTable');
      return {
        ...base,
        measurementId: resolve(param(p, 'measurementIdOverride')),
        eventName: param(p, 'eventName'),
        eventId: eventParams.event_id ?? '',
        userData: eventParams.user_data ?? '',
        eventParams,
      };
    }
    case 'ads_conversion':
      return {
        ...base,
        conversionId: param(p, 'conversionId'),
        conversionLabel: param(p, 'conversionLabel'),
        orderId: param(p, 'orderId') ?? '',
        enhancedConversions: {
          enabled: param(p, 'enableEnhancedConversion') === 'true',
          userDataVariable: param(p, 'cssProvidedEnhancedConversionValue') ?? '',
        },
      };
    case 'conversion_linker':
      return { ...base, crossDomain: param(p, 'enableCrossDomain') === 'true' };
    case 'consent_defaults': {
      const row = p.find((x) => x.key === 'defaultSettings')?.list?.[0]?.map ?? [];
      const defaults = Object.fromEntries(row.filter((m) => m.key !== 'region').map((m) => [m.key!, m.value ?? '']));
      return {
        ...base,
        consentDefaults: {
          ad_storage: defaults.ad_storage ?? '',
          analytics_storage: defaults.analytics_storage ?? '',
          ad_user_data: defaults.ad_user_data ?? '',
          ad_personalization: defaults.ad_personalization ?? '',
        },
        waitForUpdateMs: Number(param(p, 'waitForUpdate') ?? 0),
        adsDataRedaction: param(p, 'adsDataRedaction') === 'true',
      };
    }
    case 'meta_pixel':
      return {
        ...base,
        pixelId: resolve(param(p, 'pixelIds')),
        eventName: param(p, 'standardEventName'),
        eventId: param(p, 'eventId') ?? '',
      };
    case 'ga4_server':
      return { ...base, measurementId: resolve(param(p, 'measurementId')) };
    case 'meta_capi': {
      const ud = tableRows(p, 'userDataList', 'name', 'value');
      return {
        ...base,
        pixelIdRef: param(p, 'pixelId'),
        pixelId: resolve(param(p, 'pixelId')),
        eventName: param(p, 'eventNameOverride'),
        eventId: param(p, 'eventId') ?? '',
        actionSource: param(p, 'actionSource'),
        userData: { em: ud.em ?? '', ph: ud.ph ?? '', fbc: ud.fbc ?? '', fbp: ud.fbp ?? '', client_ip_address: ud.client_ip_address ?? '', client_user_agent: ud.client_user_agent ?? '' },
      };
    }
    default:
      return base;
  }
}
