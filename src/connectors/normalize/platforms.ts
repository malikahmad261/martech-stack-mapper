import type { ChangeEvent, Entity, MetricPoint, Tool } from '../../model/schema';
import type { Ga4Raw } from '../demo/raw/ga4';
import type { GoogleAdsRaw } from '../demo/raw/googleAds';
import type { MetaRaw } from '../demo/raw/meta';
import type { siteTrackingPlan } from '../demo/raw/site';

export interface Normalized {
  tool: Tool;
  entities: Entity[];
  metrics: MetricPoint[];
  changeEvents: ChangeEvent[];
}

const isoDate = (yyyymmdd: string) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

export function normalizeSite(plan: typeof siteTrackingPlan): Normalized {
  return {
    tool: { id: 'site', name: 'Website', externalId: plan.domain, settings: { trackingPlanEvents: plan.events.length } },
    entities: plan.events.map((e, i) => ({
      id: `site:dl:${e.event}`,
      tool: 'site',
      kind: 'datalayer_event',
      externalId: e.event,
      name: e.event,
      status: 'active',
      config: { description: e.description, params: e.params.join(', '), inTrackingPlan: true },
      health: 'unknown',
      sourceRef: { snapshotId: 'tracking-plan', path: `events[${i}]` },
    })),
    metrics: [],
    changeEvents: [],
  };
}

export function normalizeGa4(raw: Ga4Raw, snapshotId: string): Normalized {
  const ref = (path: string) => ({ snapshotId, path });
  const propertyId = raw.property.name.split('/')[1];
  const keyEvents = new Map(raw.keyEvents.map((k) => [k.eventName, k]));
  const entities: Entity[] = [
    {
      id: `ga4:property:${propertyId}`,
      tool: 'ga4',
      kind: 'ga4_property',
      externalId: propertyId,
      name: raw.property.displayName,
      status: 'active',
      config: {
        timeZone: raw.property.timeZone,
        currencyCode: raw.property.currencyCode,
        industryCategory: raw.property.industryCategory,
        eventDataRetention: raw.dataRetentionSettings.eventDataRetention,
      },
      health: 'unknown',
      sourceRef: ref('property'),
    },
    ...raw.dataStreams.map((s, i) => ({
      id: `ga4:stream:${s.name.split('/').pop()}`,
      tool: 'ga4' as const,
      kind: 'ga4_stream' as const,
      externalId: s.webStreamData.measurementId,
      name: s.displayName,
      status: 'active' as const,
      config: { measurementId: s.webStreamData.measurementId, defaultUri: s.webStreamData.defaultUri, streamType: 'Web' },
      health: 'unknown' as const,
      sourceRef: ref(`dataStreams[${i}]`),
    })),
    ...raw.reports.eventsLast28Days.map((r, i) => {
      const name = r.dimensionValues[0];
      const ke = keyEvents.get(name);
      return {
        id: `ga4:event:${name}`,
        tool: 'ga4' as const,
        kind: 'ga4_event' as const,
        externalId: name,
        name,
        status: 'active' as const,
        config: { eventCount28d: Number(r.metricValues[0]), isKeyEvent: !!ke, countingMethod: ke?.countingMethod ?? '' },
        health: 'unknown' as const,
        sourceRef: ref(`reports.eventsLast28Days[${i}]`),
      };
    }),
    ...raw.customDimensions.map((d, i) => ({
      id: `ga4:custom_dimension:${d.parameterName}`,
      tool: 'ga4' as const,
      kind: 'ga4_custom_dimension' as const,
      externalId: d.name.split('/').pop()!,
      name: d.displayName,
      status: 'active' as const,
      config: { parameterName: d.parameterName, scope: d.scope },
      health: 'unknown' as const,
      sourceRef: ref(`customDimensions[${i}]`),
    })),
    ...raw.googleAdsLinks.map((l, i) => ({
      id: `ga4:link:${l.name.split('/').pop()}`,
      tool: 'ga4' as const,
      kind: 'ga4_link' as const,
      externalId: l.name.split('/').pop()!,
      name: `Google Ads link – ${l.customerId.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')}`,
      status: 'active' as const,
      config: { linkType: 'Google Ads', customerId: l.customerId, adsPersonalizationEnabled: l.adsPersonalizationEnabled },
      health: 'unknown' as const,
      sourceRef: ref(`googleAdsLinks[${i}]`),
    })),
  ];

  const streamId = entities.find((e) => e.kind === 'ga4_stream')!.id;
  const metrics: MetricPoint[] = [
    ...raw.reports.dailyEvents.map((r) => ({
      entityId: `ga4:event:${r.dimensionValues[1]}`,
      date: isoDate(r.dimensionValues[0]),
      metric: 'events' as const,
      value: Number(r.metricValues[0]),
    })),
    ...raw.reports.dailyChannels.flatMap((r) => [
      { entityId: streamId, date: isoDate(r.dimensionValues[0]), metric: 'sessions' as const, value: Number(r.metricValues[0]), dimensions: { channel: r.dimensionValues[1] } },
      {
        entityId: streamId,
        date: isoDate(r.dimensionValues[0]),
        metric: 'engaged_sessions' as const,
        value: Number(r.metricValues[1]),
        dimensions: { channel: r.dimensionValues[1] },
      },
    ]),
  ];

  const changeEvents: ChangeEvent[] = raw.changeHistoryEvents.map((c) => {
    const change = c.changes[0];
    const ke = ((change.resourceBeforeChange ?? change.resourceAfterChange) as { keyEvent?: { eventName: string } }).keyEvent;
    return {
      id: `ga4:change:${c.id}`,
      tool: 'ga4',
      at: c.changeTime,
      actor: c.userActorEmail,
      kind: 'config_change',
      summary: ke
        ? `Key event "${ke.eventName}" ${change.action === 'DELETED' ? 'removed (no longer a key event)' : change.action.toLowerCase()}`
        : `${change.resource} ${change.action.toLowerCase()}`,
      entityIds: ke ? [`ga4:event:${ke.eventName}`] : [],
      before: change.resourceBeforeChange,
      after: change.resourceAfterChange,
    };
  });

  return {
    tool: {
      id: 'ga4',
      name: 'Google Analytics 4',
      externalId: propertyId,
      settings: {
        measurementId: raw.dataStreams[0]?.webStreamData.measurementId,
        timeZone: raw.property.timeZone,
        currency: raw.property.currencyCode,
        keyEvents: raw.keyEvents.length,
        googleAdsLinked: raw.googleAdsLinks.length > 0,
      },
      lastChangedAt: raw.changeHistoryEvents.map((c) => c.changeTime).sort().pop(),
    },
    entities,
    metrics,
    changeEvents,
  };
}

export function normalizeGoogleAds(raw: GoogleAdsRaw, snapshotId: string): Normalized {
  const ref = (path: string) => ({ snapshotId, path });
  const caId = (resourceName: string) => `google_ads:conversion_action:${resourceName.split('/').pop()}`;
  const c = raw.customer;
  const uploads = new Map(raw.offlineConversionUploadClientSummaries.map((u) => [u.conversionAction, u]));

  const entities: Entity[] = [
    {
      id: `google_ads:account:${c.id}`,
      tool: 'google_ads',
      kind: 'gads_account',
      externalId: c.id,
      name: c.descriptiveName,
      status: 'active',
      config: {
        autoTaggingEnabled: c.autoTaggingEnabled,
        conversionTrackingId: c.conversionTrackingSetting.conversionTrackingId,
        enhancedConversionsForLeads: c.conversionTrackingSetting.enhancedConversionsForLeadsEnabled,
        acceptedCustomerDataTerms: c.conversionTrackingSetting.acceptedCustomerDataTerms,
        currencyCode: c.currencyCode,
        timeZone: c.timeZone,
      },
      health: 'unknown',
      sourceRef: ref('customer'),
    },
    ...raw.conversionActions.map((a, i) => {
      const sendTo = a.tagSnippets?.[0]?.eventSnippet.match(/AW-(\d+)\/([\w-]+)/);
      const upload = uploads.get(a.resourceName);
      return {
        id: caId(a.resourceName),
        tool: 'google_ads' as const,
        kind: 'gads_conversion_action' as const,
        externalId: a.id,
        name: a.name,
        status: a.status === 'ENABLED' ? ('active' as const) : ('deleted' as const),
        config: {
          source: a.type,
          category: a.category,
          primaryForGoal: a.primaryForGoal,
          countingType: a.countingType,
          defaultValue: a.valueSettings.defaultValue,
          alwaysUseDefaultValue: a.valueSettings.alwaysUseDefaultValue,
          conversionId: sendTo?.[1] ?? '',
          conversionLabel: sendTo?.[2] ?? '',
          ga4EventName: a.googleAnalytics4Settings?.eventName ?? '',
          ga4PropertyId: a.googleAnalytics4Settings?.propertyId ?? '',
          offlineUpload: upload
            ? { status: upload.status, lastUploadAt: upload.lastUploadDateTime, successful: Number(upload.successfulEventCount), total: Number(upload.totalEventCount) }
            : undefined,
        },
        health: 'unknown' as const,
        sourceRef: ref(`conversionActions[${i}]`),
      };
    }),
    ...raw.campaigns.map((cp, i) => ({
      id: `google_ads:campaign:${cp.id}`,
      tool: 'google_ads' as const,
      kind: 'gads_campaign' as const,
      externalId: cp.id,
      name: cp.name,
      status: cp.status === 'ENABLED' ? ('active' as const) : ('paused' as const),
      config: {
        channelType: cp.advertisingChannelType,
        biddingStrategy: cp.biddingStrategyType,
        dailyBudget: Number(cp.campaignBudget.amountMicros) / 1e6,
        conversionGoalIds: cp.conversionGoals.map(caId),
      },
      health: 'unknown' as const,
      sourceRef: ref(`campaigns[${i}]`),
    })),
  ];

  const metrics: MetricPoint[] = [
    ...raw.campaignDaily.flatMap((r) => {
      const entityId = `google_ads:campaign:${r.campaign.id}`;
      return [
        { entityId, date: r.segments.date, metric: 'spend' as const, value: Number(r.metrics.costMicros) / 1e6 },
        { entityId, date: r.segments.date, metric: 'impressions' as const, value: Number(r.metrics.impressions) },
        { entityId, date: r.segments.date, metric: 'clicks' as const, value: Number(r.metrics.clicks) },
        { entityId, date: r.segments.date, metric: 'conversions' as const, value: r.metrics.conversions },
      ];
    }),
    ...raw.conversionActionDaily.map((r) => ({
      entityId: caId(r.segments.conversionAction),
      date: r.segments.date,
      metric: 'conversions' as const,
      value: r.metrics.allConversions,
    })),
  ];

  const changeEvents: ChangeEvent[] = raw.changeEvents.map((ce) => {
    const before = Number((ce.oldResource as { campaignBudget: { amountMicros: string } }).campaignBudget.amountMicros) / 1e6;
    const after = Number((ce.newResource as { campaignBudget: { amountMicros: string } }).campaignBudget.amountMicros) / 1e6;
    const campaign = raw.campaigns.find((cp) => cp.resourceName === ce.campaign);
    return {
      id: `google_ads:change:${ce.resourceName.split('/').pop()}`,
      tool: 'google_ads',
      at: `${ce.changeDateTime.replace(' ', 'T')}Z`,
      actor: ce.userEmail,
      kind: 'budget_change',
      summary: `Daily budget for "${campaign?.name}" changed from $${before} to $${after}`,
      entityIds: campaign ? [`google_ads:campaign:${campaign.id}`] : [],
      before: { dailyBudget: before },
      after: { dailyBudget: after },
    };
  });

  return {
    tool: {
      id: 'google_ads',
      name: 'Google Ads',
      externalId: c.id.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3'),
      settings: {
        autoTaggingEnabled: c.autoTaggingEnabled,
        enhancedConversionsForLeads: c.conversionTrackingSetting.enhancedConversionsForLeadsEnabled,
        conversionTrackingId: `AW-${c.conversionTrackingSetting.conversionTrackingId}`,
        currency: c.currencyCode,
      },
      lastChangedAt: raw.changeEvents.map((e) => `${e.changeDateTime.replace(' ', 'T')}Z`).sort().pop(),
    },
    entities,
    metrics,
    changeEvents,
  };
}

const META_EVENT_TYPES: Record<string, string> = { LEAD: 'Lead', SCHEDULE: 'Schedule', CONTACT: 'Contact', COMPLETE_REGISTRATION: 'CompleteRegistration' };

export function normalizeMeta(raw: MetaRaw, snapshotId: string): Normalized {
  const ref = (path: string) => ({ snapshotId, path });
  const sources = new Map<string, Set<string>>();
  for (const s of raw.pixelStats) {
    if (s.count > 0) (sources.get(s.event) ?? sources.set(s.event, new Set()).get(s.event)!).add(s.source);
  }

  const entities: Entity[] = [
    {
      id: `meta:ad_account:${raw.adAccount.account_id}`,
      tool: 'meta',
      kind: 'meta_ad_account',
      externalId: raw.adAccount.id,
      name: raw.adAccount.name,
      status: raw.adAccount.account_status === 1 ? 'active' : 'paused',
      config: { currency: raw.adAccount.currency, timeZone: raw.adAccount.timezone_name },
      health: 'unknown',
      sourceRef: ref('adAccount'),
    },
    {
      id: `meta:dataset:${raw.dataset.id}`,
      tool: 'meta',
      kind: 'meta_dataset',
      externalId: raw.dataset.id,
      name: raw.dataset.name,
      status: raw.dataset.is_unavailable ? 'paused' : 'active',
      config: {
        firstPartyCookies: raw.dataset.first_party_cookie_status === 'FIRST_PARTY_COOKIE_ENABLED',
        automaticMatching: raw.dataset.automatic_matching_fields.join(', '),
        lastFiredAt: raw.dataset.last_fired_time,
      },
      health: 'unknown',
      sourceRef: ref('dataset'),
    },
    ...raw.datasetQuality.web.map((q, i) => {
      const keys = Object.fromEntries((q.event_match_quality?.match_key_feedback ?? []).map((k) => [k.identifier, k.coverage.percentage]));
      const dedupe = q.dedupe_key_feedback?.[0];
      const src = sources.get(q.event_name) ?? new Set();
      return {
        id: `meta:event:${q.event_name}`,
        tool: 'meta' as const,
        kind: 'meta_event' as const,
        externalId: q.event_name,
        name: q.event_name,
        status: 'active' as const,
        config: {
          receivesBrowser: src.has('browser'),
          receivesServer: src.has('server'),
          emq: q.event_match_quality?.composite_score ?? null,
          matchKeyCoverage: keys,
          dedupBrowserPct: dedupe?.browser_events_with_dedupe_key.percentage ?? null,
          dedupServerPct: dedupe?.server_events_with_dedupe_key.percentage ?? null,
          eventCoveragePct: q.event_coverage?.percentage ?? null,
        },
        health: 'unknown' as const,
        sourceRef: ref(`datasetQuality.web[${i}]`),
      };
    }),
    ...raw.customConversions.map((cc, i) => {
      const rule = JSON.parse(cc.rule) as { and: Record<string, { eq: string }>[] };
      const event = rule.and.find((r) => r.event)?.event.eq ?? '';
      const extra = rule.and.filter((r) => !r.event).map((r) => Object.entries(r).map(([k, v]) => `${k} = ${v.eq}`)[0]);
      return {
        id: `meta:custom_conversion:${cc.id}`,
        tool: 'meta' as const,
        kind: 'meta_custom_conversion' as const,
        externalId: cc.id,
        name: cc.name,
        status: 'active' as const,
        config: { eventName: event, ruleConditions: extra.join('; '), customEventType: cc.custom_event_type },
        health: 'unknown' as const,
        sourceRef: ref(`customConversions[${i}]`),
      };
    }),
    ...raw.campaigns.map((cp, i) => {
      const po = cp.adsets[0].promoted_object;
      return {
        id: `meta:campaign:${cp.id}`,
        tool: 'meta' as const,
        kind: 'meta_campaign' as const,
        externalId: cp.id,
        name: cp.name,
        status: cp.status === 'ACTIVE' ? ('active' as const) : ('paused' as const),
        config: {
          objective: cp.objective,
          optimisationEvent: po.custom_event_type ? META_EVENT_TYPES[po.custom_event_type] : '',
          customConversionId: po.custom_conversion_id ? `meta:custom_conversion:${po.custom_conversion_id}` : '',
        },
        health: 'unknown' as const,
        sourceRef: ref(`campaigns[${i}]`),
      };
    }),
  ];

  const metrics: MetricPoint[] = [
    ...raw.insights.flatMap((r) => {
      const entityId = `meta:campaign:${r.campaign_id}`;
      return [
        { entityId, date: r.date_start, metric: 'spend' as const, value: Number(r.spend) },
        { entityId, date: r.date_start, metric: 'impressions' as const, value: Number(r.impressions) },
        { entityId, date: r.date_start, metric: 'clicks' as const, value: Number(r.clicks) },
        { entityId, date: r.date_start, metric: 'conversions' as const, value: Number(r.actions[0]?.value ?? 0) },
      ];
    }),
    ...raw.insightsByPlacement.map((r) => ({
      entityId: `meta:campaign:${r.campaign_id}`,
      date: r.date_start,
      metric: 'clicks' as const,
      value: Number(r.clicks),
      dimensions: { placement: r.publisher_platform },
    })),
    ...raw.pixelStats.map((s) => ({
      entityId: `meta:event:${s.event}`,
      date: s.date,
      metric: s.source === 'browser' ? ('events_browser' as const) : ('events_server' as const),
      value: s.count,
    })),
  ];

  const changeEvents: ChangeEvent[] = raw.activities.map((a, i) => {
    const extra = JSON.parse(a.extra_data) as { old_value: string; new_value: string };
    return {
      id: `meta:activity:${i}`,
      tool: 'meta',
      at: a.event_time.replace('+0000', 'Z'),
      actor: a.actor_name,
      kind: 'status_change',
      summary: `Campaign "${a.object_name}" ${extra.new_value === 'PAUSED' ? 'paused' : 'resumed'}`,
      entityIds: [`meta:campaign:${a.object_id}`],
      before: { status: extra.old_value },
      after: { status: extra.new_value },
    };
  });

  return {
    tool: {
      id: 'meta',
      name: 'Meta Ads',
      externalId: raw.adAccount.id,
      settings: {
        datasetId: raw.dataset.id,
        firstPartyCookies: raw.dataset.first_party_cookie_status === 'FIRST_PARTY_COOKIE_ENABLED',
        automaticMatching: raw.dataset.automatic_matching_fields.join(', '),
        currency: raw.adAccount.currency,
      },
      lastChangedAt: raw.activities.map((a) => a.event_time.replace('+0000', 'Z')).sort().pop(),
    },
    entities,
    metrics,
    changeEvents,
  };
}
