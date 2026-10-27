import { z } from 'zod';
import {
  ChangeEventSchema,
  EntitySchema,
  MetricPointSchema,
  SourceSnapshotSchema,
  ToolSchema,
  type ChangeEvent,
  type Entity,
  type MetricPoint,
  type SourceSnapshot,
  type Tool,
} from '../model/schema';
import { ga4Raw } from './demo/raw/ga4';
import { googleAdsRaw } from './demo/raw/googleAds';
import { gtmServerExport } from './demo/raw/gtmServer';
import { gtmWebExport } from './demo/raw/gtmWeb';
import { metaRaw } from './demo/raw/meta';
import { siteTrackingPlan } from './demo/raw/site';
import { LATEST_SCAN_AT } from './demo/timeline';
import { normalizeGtm } from './normalize/gtm';
import { normalizeGa4, normalizeGoogleAds, normalizeMeta, normalizeSite } from './normalize/platforms';

export interface SourceData {
  snapshots: SourceSnapshot[];
  tools: Tool[];
  entities: Entity[];
  metrics: MetricPoint[];
  changeEvents: ChangeEvent[];
}

// Phase 1: every connector reads bundled demo data. Phase 2 swaps these for live API fetches
// that return the same raw formats, so everything downstream stays unchanged.
export function loadSources(scanId: string, fetchedAt = LATEST_SCAN_AT): SourceData {
  const snap = (source: SourceSnapshot['source'], format: string, payload: unknown): SourceSnapshot => ({
    id: `${scanId}:${source}`,
    scanId,
    source,
    fetchedAt,
    format,
    payload,
  });
  const snapshots = [
    snap('gtm_web', 'gtm_container_export_v2', gtmWebExport),
    snap('gtm_server', 'gtm_container_export_v2', gtmServerExport),
    snap('ga4', 'ga4_admin_v1beta+data_v1beta', ga4Raw),
    snap('google_ads', 'google_ads_api_gaql', googleAdsRaw),
    snap('meta', 'meta_graph_api', metaRaw),
  ];

  const parts = [
    normalizeSite(siteTrackingPlan),
    { ...normalizeGtm('gtm_web', gtmWebExport, snapshots[0].id), metrics: [] },
    { ...normalizeGtm('gtm_server', gtmServerExport, snapshots[1].id), metrics: [] },
    normalizeGa4(ga4Raw, snapshots[2].id),
    normalizeGoogleAds(googleAdsRaw, snapshots[3].id),
    normalizeMeta(metaRaw, snapshots[4].id),
  ];

  const data: SourceData = {
    snapshots,
    tools: parts.map((p) => p.tool),
    entities: parts.flatMap((p) => p.entities),
    metrics: parts.flatMap((p) => p.metrics),
    changeEvents: parts.flatMap((p) => p.changeEvents).sort((a, b) => a.at.localeCompare(b.at)),
  };

  // Validate the normalised model at load, so a connector that drifts from the schema fails loudly.
  z.array(SourceSnapshotSchema).parse(data.snapshots);
  z.array(ToolSchema).parse(data.tools);
  z.array(EntitySchema).parse(data.entities);
  z.array(MetricPointSchema).parse(data.metrics);
  z.array(ChangeEventSchema).parse(data.changeEvents);
  return data;
}
