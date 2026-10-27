import { z } from 'zod';

// Normalised data model shared by connectors, engine and UI. See docs/REQUIREMENTS.md §8.

export const ToolIdSchema = z.enum(['site', 'gtm_web', 'gtm_server', 'ga4', 'google_ads', 'meta']);
export type ToolId = z.infer<typeof ToolIdSchema>;
export type SourceId = Exclude<ToolId, 'site'>;

export const HealthSchema = z.enum(['healthy', 'degraded', 'broken', 'inactive', 'unknown']);
export type Health = z.infer<typeof HealthSchema>;

export const SourceSnapshotSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  source: z.enum(['gtm_web', 'gtm_server', 'ga4', 'google_ads', 'meta']),
  fetchedAt: z.string(),
  format: z.string(),
  payload: z.unknown(),
});
export type SourceSnapshot = z.infer<typeof SourceSnapshotSchema>;

export const ToolSchema = z.object({
  id: ToolIdSchema,
  name: z.string(),
  externalId: z.string(),
  settings: z.record(z.unknown()),
  lastChangedAt: z.string().optional(),
});
export type Tool = z.infer<typeof ToolSchema>;

export const EntityKindSchema = z.enum([
  'datalayer_event',
  'gtm_container',
  'gtm_tag',
  'gtm_trigger',
  'gtm_variable',
  'gtm_client',
  'ga4_property',
  'ga4_stream',
  'ga4_event',
  'ga4_custom_dimension',
  'ga4_link',
  'gads_account',
  'gads_conversion_action',
  'gads_campaign',
  'meta_ad_account',
  'meta_dataset',
  'meta_event',
  'meta_custom_conversion',
  'meta_campaign',
]);
export type EntityKind = z.infer<typeof EntityKindSchema>;

export const EntitySchema = z.object({
  id: z.string(),
  tool: ToolIdSchema,
  kind: EntityKindSchema,
  externalId: z.string(),
  name: z.string(),
  status: z.enum(['active', 'paused', 'deleted']),
  config: z.record(z.unknown()),
  health: HealthSchema,
  sourceRef: z.object({ snapshotId: z.string(), path: z.string() }),
});
export type Entity = z.infer<typeof EntitySchema>;

export const LinkTypeSchema = z.enum([
  'fires_on',
  'listens_for',
  'uses_variable',
  'sends_to',
  'routes_to',
  'produces_event',
  'imports',
  'deduplicates_with',
  'feeds_custom_conversion',
  'optimises_for',
  'product_link',
]);
export type LinkType = z.infer<typeof LinkTypeSchema>;

export const EventKeySchema = z.object({ ns: z.enum(['ga4', 'meta']), name: z.string() });
export type EventKey = z.infer<typeof EventKeySchema>;

export const LinkSchema = z.object({
  id: z.string(),
  type: LinkTypeSchema,
  from: z.string(),
  to: z.string(),
  health: HealthSchema,
  evidence: z.array(z.string()),
  inferred: z.boolean(),
  eventKey: EventKeySchema.optional(),
});
export type Link = z.infer<typeof LinkSchema>;

export const MetricNameSchema = z.enum([
  'spend',
  'impressions',
  'clicks',
  'conversions',
  'conversion_value',
  'events',
  'events_browser',
  'events_server',
  'sessions',
  'engaged_sessions',
]);
export type MetricName = z.infer<typeof MetricNameSchema>;

export const MetricPointSchema = z.object({
  entityId: z.string(),
  date: z.string(),
  metric: MetricNameSchema,
  value: z.number(),
  dimensions: z.record(z.string()).optional(),
});
export type MetricPoint = z.infer<typeof MetricPointSchema>;

export const ChangeEventSchema = z.object({
  id: z.string(),
  tool: ToolIdSchema,
  at: z.string(),
  actor: z.string(),
  kind: z.enum(['gtm_publish', 'config_change', 'budget_change', 'bid_change', 'status_change', 'fix_applied']),
  summary: z.string(),
  entityIds: z.array(z.string()),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
});
export type ChangeEvent = z.infer<typeof ChangeEventSchema>;

export const IssueCategorySchema = z.enum([
  'conversion_tracking',
  'cookies_click_ids',
  'consent',
  'configuration',
  'data_quality',
]);
export type IssueCategory = z.infer<typeof IssueCategorySchema>;

export const SeveritySchema = z.enum(['critical', 'high', 'medium', 'low']);
export type Severity = z.infer<typeof SeveritySchema>;

export const IssueSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  category: IssueCategorySchema,
  severity: SeveritySchema,
  title: z.string(),
  entityIds: z.array(z.string()),
  linkIds: z.array(z.string()),
  evidence: z.record(z.unknown()),
  diagnosis: z.string(),
  status: z.enum(['open', 'fix_pending', 'resolved', 'dismissed']),
  verification: z.enum(['confirmed', 'pending_data']).optional(),
  firstDetectedScanId: z.string(),
  resolvedScanId: z.string().optional(),
  fixId: z.string().optional(),
});
export type Issue = z.infer<typeof IssueSchema>;

export const AnomalyTypeSchema = z.enum(['spend_driven', 'tracking_outage', 'bot_traffic']);
export type AnomalyType = z.infer<typeof AnomalyTypeSchema>;

export const AnomalySchema = z.object({
  id: z.string(),
  type: AnomalyTypeSchema,
  entityId: z.string(),
  metric: MetricNameSchema,
  window: z.object({ start: z.string(), end: z.string() }),
  baseline: z.number(),
  observed: z.number(),
  changePct: z.number(),
  confidence: z.number(),
  signals: z.array(z.string()),
  likelyCause: z.object({
    changeEventIds: z.array(z.string()),
    issueIds: z.array(z.string()),
    explanation: z.string(),
  }),
  recommendation: z.string(),
  status: z.enum(['new', 'acknowledged', 'expected', 'resolved']),
});
export type Anomaly = z.infer<typeof AnomalySchema>;

export const FixOperationSchema = z.object({
  id: z.string(),
  entityId: z.string(),
  field: z.string(),
  op: z.enum(['set', 'add', 'remove']),
  from: z.unknown().optional(),
  to: z.unknown().optional(),
});
export type FixOperation = z.infer<typeof FixOperationSchema>;

export const FixSchema = z.object({
  id: z.string(),
  issueIds: z.array(z.string()),
  title: z.string(),
  rationale: z.string(),
  risk: z.enum(['low', 'medium', 'high']),
  manualSteps: z.array(z.string()),
  verifyAfter: z.array(z.string()),
  recommended: z.array(FixOperationSchema),
  current: z.array(FixOperationSchema),
  notes: z.string(),
  status: z.enum(['draft', 'edited', 'approved', 'applied', 'rejected']),
  history: z.array(z.object({ at: z.string(), action: z.string(), by: z.string() })),
  appliedChangeEventId: z.string().optional(),
  // Set when someone without approval rights (a client) asks a consultant to review the fix.
  reviewRequest: z.object({ at: z.string(), by: z.string(), note: z.string() }).optional(),
});
export type Fix = z.infer<typeof FixSchema>;

export const ScanSchema = z.object({
  id: z.string(),
  trigger: z.enum(['scheduled', 'on_demand', 'change_detected']),
  startedAt: z.string(),
  finishedAt: z.string(),
  sources: z.array(
    z.object({ source: z.enum(['gtm_web', 'gtm_server', 'ga4', 'google_ads', 'meta']), status: z.enum(['ok', 'error']), snapshotId: z.string() }),
  ),
  summary: z.object({ newIssues: z.number(), resolvedIssues: z.number(), configChanges: z.number() }),
});
export type Scan = z.infer<typeof ScanSchema>;
