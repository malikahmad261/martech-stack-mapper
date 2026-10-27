// Minimal typings and builders for the GTM container export format (exportFormatVersion 2).

export interface GtmParameter {
  type: 'template' | 'boolean' | 'integer' | 'list' | 'map';
  key?: string;
  value?: string;
  list?: GtmParameter[];
  map?: GtmParameter[];
}

export interface GtmCondition {
  type: 'EQUALS' | 'MATCH_REGEX' | 'CONTAINS';
  parameter: GtmParameter[];
}

export interface GtmTag {
  tagId: string;
  name: string;
  type: string;
  parameter: GtmParameter[];
  firingTriggerId: string[];
  paused?: boolean;
  consentSettings?: { consentStatus: 'notSet' | 'notNeeded' | 'needed'; consentType?: GtmParameter };
  tagFiringOption?: string;
}

export interface GtmTrigger {
  triggerId: string;
  name: string;
  type: string;
  customEventFilter?: GtmCondition[];
  filter?: GtmCondition[];
}

export interface GtmVariable {
  variableId: string;
  name: string;
  type: string;
  parameter: GtmParameter[];
}

export interface GtmClient {
  clientId: string;
  name: string;
  type: string;
  parameter: GtmParameter[];
  priority?: number;
}

export interface GtmVersionHeader {
  containerVersionId: string;
  name: string;
  description: string;
  publishedAt: string;
  publishedBy: string;
  changes: { entityType: 'tag' | 'trigger' | 'variable' | 'client'; entityId: string; name: string; field: string; before: unknown; after: unknown }[];
}

export interface GtmExport {
  exportFormatVersion: 2;
  exportTime: string;
  containerVersion: {
    accountId: string;
    containerId: string;
    containerVersionId: string;
    name: string;
    container: { publicId: string; name: string; usageContext: ('WEB' | 'SERVER')[]; taggingServerUrls?: string[] };
    tag: GtmTag[];
    trigger: GtmTrigger[];
    variable: GtmVariable[];
    client?: GtmClient[];
  };
  // Not part of the export itself: the version headers the Tag Manager API returns alongside it.
  versionHistory: GtmVersionHeader[];
}

export const t = (key: string, value: string): GtmParameter => ({ type: 'template', key, value });
export const b = (key: string, value: boolean): GtmParameter => ({ type: 'boolean', key, value: String(value) });
export const row = (name: string, value: string, nameKey = 'parameter', valueKey = 'parameterValue'): GtmParameter => ({
  type: 'map',
  map: [t(nameKey, name), t(valueKey, value)],
});
export const table = (key: string, rows: GtmParameter[]): GtmParameter => ({ type: 'list', key, list: rows });

export const eq = (arg0: string, arg1: string): GtmCondition => ({ type: 'EQUALS', parameter: [t('arg0', arg0), t('arg1', arg1)] });
export const regex = (arg0: string, arg1: string): GtmCondition => ({ type: 'MATCH_REGEX', parameter: [t('arg0', arg0), t('arg1', arg1)] });
