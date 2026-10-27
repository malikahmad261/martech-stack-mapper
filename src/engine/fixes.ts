import type { Entity, FixOperation } from '../model/schema';

export type FieldType = 'text' | 'boolean' | 'enum' | 'number' | 'varRef' | 'triggerRefs';
export interface FieldDef {
  path: string;
  label: string;
  type: FieldType;
  options?: string[];
}

const CONSENT_VALUES = ['granted', 'denied'];

const GTM_COMMON: FieldDef[] = [
  { path: 'firingTriggerIds', label: 'Firing triggers', type: 'triggerRefs' },
  { path: 'paused', label: 'Paused', type: 'boolean' },
];
const GTM_WEB_CONSENT: FieldDef[] = [
  { path: 'consent.status', label: 'Additional consent', type: 'enum', options: ['notSet', 'notNeeded', 'needed'] },
  { path: 'consent.types', label: 'Required consent types', type: 'text' },
];

const TAG_FIELDS: Record<string, FieldDef[]> = {
  google_tag: [
    { path: 'measurementId', label: 'Tag ID', type: 'text' },
    { path: 'serverContainerUrl', label: 'server_container_url', type: 'text' },
  ],
  ga4_event: [
    { path: 'eventName', label: 'Event name', type: 'text' },
    { path: 'eventId', label: 'event_id parameter', type: 'varRef' },
    { path: 'userData', label: 'user_data parameter', type: 'varRef' },
  ],
  ads_conversion: [
    { path: 'conversionLabel', label: 'Conversion label', type: 'text' },
    { path: 'orderId', label: 'Transaction ID', type: 'varRef' },
    { path: 'enhancedConversions.enabled', label: 'Include user-provided data', type: 'boolean' },
    { path: 'enhancedConversions.userDataVariable', label: 'User-provided data variable', type: 'varRef' },
  ],
  conversion_linker: [{ path: 'crossDomain', label: 'Enable linking across domains', type: 'boolean' }],
  consent_defaults: [
    { path: 'consentDefaults.ad_storage', label: 'Default ad_storage', type: 'enum', options: CONSENT_VALUES },
    { path: 'consentDefaults.analytics_storage', label: 'Default analytics_storage', type: 'enum', options: CONSENT_VALUES },
    { path: 'consentDefaults.ad_user_data', label: 'Default ad_user_data', type: 'enum', options: CONSENT_VALUES },
    { path: 'consentDefaults.ad_personalization', label: 'Default ad_personalization', type: 'enum', options: CONSENT_VALUES },
    { path: 'waitForUpdateMs', label: 'Wait for update (ms)', type: 'number' },
  ],
  meta_pixel: [
    { path: 'eventName', label: 'Standard event', type: 'enum', options: ['PageView', 'Lead', 'Schedule', 'Contact', 'CompleteRegistration'] },
    { path: 'eventId', label: 'Event ID', type: 'varRef' },
  ],
  meta_capi: [
    { path: 'eventName', label: 'Event name override', type: 'text' },
    { path: 'eventId', label: 'Event ID', type: 'varRef' },
    { path: 'userData.em', label: 'User data: em (email)', type: 'varRef' },
    { path: 'userData.ph', label: 'User data: ph (phone)', type: 'varRef' },
    { path: 'userData.fbc', label: 'User data: fbc', type: 'varRef' },
    { path: 'userData.fbp', label: 'User data: fbp', type: 'varRef' },
  ],
  ga4_server: [{ path: 'measurementId', label: 'Measurement ID', type: 'text' }],
};

export function editableFields(e: Entity): FieldDef[] {
  const c = e.config as Record<string, any>;
  switch (e.kind) {
    case 'gtm_tag':
      return [...(TAG_FIELDS[c.tagType] ?? []), ...GTM_COMMON, ...(e.tool === 'gtm_web' ? GTM_WEB_CONSENT : [])];
    case 'gtm_trigger':
      return c.triggerType === 'Custom Event' ? [{ path: 'customEventName', label: 'Event name', type: 'text' }] : [];
    case 'ga4_event':
      return [
        { path: 'isKeyEvent', label: 'Mark as key event', type: 'boolean' },
        { path: 'countingMethod', label: 'Key event counting', type: 'enum', options: ['ONCE_PER_EVENT', 'ONCE_PER_SESSION'] },
      ];
    case 'gads_conversion_action':
      return [
        { path: 'primaryForGoal', label: 'Primary action (used for bidding)', type: 'boolean' },
        { path: 'countingType', label: 'Count', type: 'enum', options: ['ONE_PER_CLICK', 'MANY_PER_CLICK'] },
        { path: 'defaultValue', label: 'Default value', type: 'number' },
        {
          path: 'category',
          label: 'Category',
          type: 'enum',
          options: ['SUBMIT_LEAD_FORM', 'BOOK_APPOINTMENT', 'PHONE_CALL_LEAD', 'QUALIFIED_LEAD', 'SIGNUP'],
        },
      ];
    case 'gads_account':
      return [
        { path: 'autoTaggingEnabled', label: 'Auto-tagging', type: 'boolean' },
        { path: 'enhancedConversionsForLeads', label: 'Enhanced conversions for leads', type: 'boolean' },
      ];
    default:
      return [];
  }
}

export function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const [head, ...rest] = path.split('.');
  const copy = { ...obj };
  copy[head] = rest.length ? setPath((obj[head] as Record<string, unknown>) ?? {}, rest.join('.'), value) : value;
  return copy;
}

/** Apply operations to entity config, returning new entity objects (inputs are not mutated). */
export function applyOperations(entities: Entity[], ops: FixOperation[]): Entity[] {
  const byId = new Map(entities.map((e) => [e.id, e]));
  for (const op of ops) {
    const e = byId.get(op.entityId);
    if (!e) continue;
    const current = getPath(e.config, op.field);
    let next: unknown = op.to;
    if (op.op === 'add') next = [...((current as unknown[]) ?? []), ...(Array.isArray(op.to) ? op.to : [op.to])];
    if (op.op === 'remove') next = ((current as unknown[]) ?? []).filter((x) => !(Array.isArray(op.to) ? op.to : [op.to]).includes(x));
    const config = setPath(e.config, op.field, next);
    const status = op.field === 'paused' ? (next ? 'paused' : 'active') : e.status;
    byId.set(e.id, { ...e, config, status });
  }
  return entities.map((e) => byId.get(e.id)!);
}

const BUILT_IN_VARIABLES = new Set(['Page Path', 'Page URL', 'Page Hostname', 'Referrer', 'Event', '_event', 'Client Name', 'Event Name', 'Container ID']);

export interface ValidationResult {
  errors: Record<string, string>; // op.id → message
  warnings: Record<string, string>;
}

export function validateOperations(entities: Entity[], ops: FixOperation[]): ValidationResult {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};
  const varsByTool = (tool: string) => new Set(entities.filter((e) => e.kind === 'gtm_variable' && e.tool === tool).map((e) => e.name));
  const plan = new Set(entities.filter((e) => e.kind === 'datalayer_event' && (e.config as { inTrackingPlan?: boolean }).inTrackingPlan).map((e) => e.name));
  const after = applyOperations(entities, ops);
  const afterById = new Map(after.map((e) => [e.id, e]));

  for (const op of ops) {
    const e = byId.get(op.entityId);
    if (!e) {
      errors[op.id] = 'Target no longer exists';
      continue;
    }
    const def = editableFields(e).find((f) => f.path === op.field);
    if (!def) {
      errors[op.id] = `"${op.field}" can't be changed on this ${e.kind.replace(/_/g, ' ')}`;
      continue;
    }
    const v = op.to;
    const refs = typeof v === 'string' ? [...v.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]) : [];
    const vars = varsByTool(e.tool);
    const unknown = refs.filter((r) => !vars.has(r) && !BUILT_IN_VARIABLES.has(r));

    switch (def.type) {
      case 'boolean':
        if (typeof v !== 'boolean') errors[op.id] = 'Must be on or off';
        break;
      case 'number':
        if (typeof v !== 'number' || !Number.isFinite(v)) errors[op.id] = 'Must be a number';
        break;
      case 'enum':
        if (!def.options!.includes(String(v))) errors[op.id] = `Must be one of ${def.options!.join(', ')}`;
        break;
      case 'varRef':
        if (typeof v !== 'string') errors[op.id] = 'Must be a variable reference';
        else if (v && !/^\{\{[^}]+\}\}$/.test(v.trim())) errors[op.id] = 'Use a variable reference like {{DLV – event_id}}';
        else if (unknown.length) errors[op.id] = `Variable {{${unknown[0]}}} doesn't exist in this container`;
        break;
      case 'triggerRefs': {
        const ids = (afterById.get(e.id)!.config as Record<string, unknown>).firingTriggerIds as string[];
        if (!ids?.length) errors[op.id] = 'A tag needs at least one firing trigger';
        else if (ids.some((id) => !byId.has(id))) errors[op.id] = 'Trigger does not exist in this container';
        break;
      }
      case 'text':
        if (typeof v !== 'string' || !v.trim()) errors[op.id] = 'Required';
        else if (unknown.length) errors[op.id] = `Variable {{${unknown[0]}}} doesn't exist in this container`;
        else if (e.kind === 'gtm_trigger' && op.field === 'customEventName' && !plan.has(v)) {
          warnings[op.id] = `"${v}" isn't in the site's tracking plan — the trigger may never fire`;
        }
        break;
    }
  }

  // Cross-field checks on the resulting entities
  for (const e of after) {
    const c = e.config as Record<string, any>;
    const touching = ops.filter((o) => o.entityId === e.id);
    if (!touching.length) continue;
    if (e.kind === 'ga4_event' && c.isKeyEvent && !c.countingMethod) errors[touching[0].id] ??= 'A key event needs a counting method';
    if (e.kind === 'gtm_tag' && c.enhancedConversions?.enabled && !c.enhancedConversions.userDataVariable) {
      errors[touching[0].id] ??= 'Enhanced conversions needs a user-provided data variable';
    }
  }
  return { errors, warnings };
}

export function formatValue(v: unknown, entities?: Map<string, Entity>): string {
  if (v === undefined || v === null || v === '') return '(empty)';
  if (typeof v === 'boolean') return v ? 'On' : 'Off';
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' && entities?.get(x)?.name) || String(x)).join(', ') || '(none)';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
