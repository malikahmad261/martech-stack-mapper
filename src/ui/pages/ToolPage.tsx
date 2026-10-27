import clsx from 'clsx';
import { ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import type { ContextItem } from '../../assistant/context';
import { isAppActor } from '../../engine/workflow';
import type { ChangeEvent, Entity, EntityKind, ToolId } from '../../model/schema';
import { SNAPSHOTS, useStore } from '../../store';
import { useDetailed } from '../../store/ui';
import { AddToChat, Checkbox, SelectionBar } from '../components/AddToChat';
import { MetricChart, seriesFor } from '../components/Charts';
import { Badge, Card, Drawer, EmptyState, EntityChip, HealthBadge, HealthDot, KeyValue, PageHeader, SectionTitle, Sparkline, Tabs, Technical, ToolBadge } from '../components/common';
import { Journey } from '../components/Journey';
import { LineageSections, useGraph } from '../components/Lineage';
import { isActiveIssue } from '../derive';
import { problemPath, useProblems } from '../hooks';
import { KIND_LABEL, TAG_TYPE_LABEL, TOOLS, TOOL_ORDER, fmtDateTime, fmtNum } from '../meta';
import { ProblemLink } from './Problems';

interface TabDef {
  id: string;
  label: string;
  kinds?: EntityKind[];
  filter?: (e: Entity) => boolean;
  history?: boolean;
}

const TABS: Record<ToolId, TabDef[]> = {
  site: [{ id: 'events', label: 'dataLayer events', kinds: ['datalayer_event'] }],
  gtm_web: [
    { id: 'tags', label: 'Tags', kinds: ['gtm_tag'] },
    { id: 'triggers', label: 'Triggers', kinds: ['gtm_trigger'] },
    { id: 'variables', label: 'Variables', kinds: ['gtm_variable'] },
    { id: 'versions', label: 'Versions', history: true },
  ],
  gtm_server: [
    { id: 'clients', label: 'Clients', kinds: ['gtm_client'] },
    { id: 'tags', label: 'Tags', kinds: ['gtm_tag'] },
    { id: 'triggers', label: 'Triggers', kinds: ['gtm_trigger'] },
    { id: 'variables', label: 'Variables', kinds: ['gtm_variable'] },
    { id: 'versions', label: 'Versions', history: true },
  ],
  ga4: [
    { id: 'events', label: 'Events', kinds: ['ga4_event'] },
    { id: 'key', label: 'Key events', kinds: ['ga4_event'], filter: (e) => !!e.config.isKeyEvent },
    { id: 'streams', label: 'Data streams', kinds: ['ga4_stream'] },
    { id: 'dims', label: 'Custom dimensions', kinds: ['ga4_custom_dimension'] },
    { id: 'links', label: 'Property & links', kinds: ['ga4_property', 'ga4_link'] },
    { id: 'history', label: 'Change history', history: true },
  ],
  google_ads: [
    { id: 'conversions', label: 'Conversion actions', kinds: ['gads_conversion_action'] },
    { id: 'campaigns', label: 'Campaigns', kinds: ['gads_campaign'] },
    { id: 'account', label: 'Account settings', kinds: ['gads_account'] },
    { id: 'history', label: 'Change history', history: true },
  ],
  meta: [
    { id: 'events', label: 'Events (Pixel + CAPI)', kinds: ['meta_event'] },
    { id: 'custom', label: 'Custom conversions', kinds: ['meta_custom_conversion'] },
    { id: 'campaigns', label: 'Campaigns', kinds: ['meta_campaign'] },
    { id: 'dataset', label: 'Dataset & account', kinds: ['meta_dataset', 'meta_ad_account'] },
    { id: 'history', label: 'Activity', history: true },
  ],
};

const SOURCE_LABEL: Record<string, string> = { WEBPAGE: 'Google Ads tag', GOOGLE_ANALYTICS_4_CUSTOM: 'GA4 import', UPLOAD_CLICKS: 'Offline import' };

function Pill({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'green' | 'amber' | 'rose' | 'indigo' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-800',
    rose: 'bg-rose-50 text-rose-700',
    indigo: 'bg-indigo-50 text-indigo-700',
  };
  return <span className={clsx('rounded px-1.5 py-0.5 text-[11px] font-medium', tones[tone])}>{children}</span>;
}

/** One-line description of an entity for tables. */
export function EntitySummary({ e, byId }: { e: Entity; byId: Map<string, Entity> }) {
  const c = e.config as Record<string, any>;
  switch (e.kind) {
    case 'gtm_tag':
      return (
        <span className="flex flex-wrap items-center gap-1.5">
          <Pill>{TAG_TYPE_LABEL[c.tagType] ?? c.tagType}</Pill>
          {c.eventName && <span className="font-mono text-xs">{c.eventName}</span>}
          {c.conversionLabel && <span className="font-mono text-xs">AW-{c.conversionId}/{c.conversionLabel}</span>}
          {c.tagType === 'google_tag' && <span className="font-mono text-xs">{c.measurementId}</span>}
          <span className="text-xs text-slate-400">on {(c.firingTriggerIds as string[]).map((id) => byId.get(id)?.name ?? 'deleted trigger').join(', ')}</span>
        </span>
      );
    case 'gtm_trigger':
      return (
        <span className="flex flex-wrap items-center gap-1.5">
          <Pill>{c.triggerType}</Pill>
          {c.customEventName && <span className="font-mono text-xs">event = {c.customEventName}</span>}
          {c.clientName && <span className="font-mono text-xs">client = {c.clientName}</span>}
          {c.eventName && <span className="font-mono text-xs">event = {c.eventName}</span>}
          {c.conditions && <span className="font-mono text-xs text-slate-500">{c.conditions}</span>}
        </span>
      );
    case 'gtm_variable':
      return (
        <span className="flex flex-wrap items-center gap-1.5">
          <Pill>{c.variableType}</Pill>
          <span className="font-mono text-xs">{c.name ?? c.keyPath ?? c.value ?? (c.email ? 'email, phone_number' : '')}</span>
        </span>
      );
    case 'gtm_client':
      return (
        <span className="flex gap-1.5">
          <Pill>{c.clientType} client</Pill>
          <span className="text-xs">cookies: {c.cookieManagement === 'server' ? 'server-managed (FPID)' : c.cookieManagement}</span>
        </span>
      );
    case 'datalayer_event':
      return c.inTrackingPlan ? <span className="text-xs text-slate-600">{c.description}</span> : <Pill tone="rose">Not in the site's tracking plan</Pill>;
    case 'ga4_event':
      return (
        <span className="flex flex-wrap items-center gap-1.5">
          {c.isKeyEvent ? <Pill tone="indigo">Key event</Pill> : <Pill>Event</Pill>}
          <span className="text-xs text-slate-500">{fmtNum(c.eventCount28d)} in last 28 days</span>
        </span>
      );
    case 'ga4_stream':
      return <span className="font-mono text-xs">{c.measurementId} · {c.defaultUri}</span>;
    case 'ga4_custom_dimension':
      return <span className="font-mono text-xs">{c.parameterName} · {c.scope}</span>;
    case 'ga4_link':
      return <span className="text-xs">Personalised advertising {c.adsPersonalizationEnabled ? 'on' : 'off'}</span>;
    case 'ga4_property':
      return <span className="text-xs">{c.timeZone} · {c.currencyCode} · retention {String(c.eventDataRetention).toLowerCase().replace('_', ' ')}</span>;
    case 'gads_conversion_action':
      return (
        <span className="flex flex-wrap items-center gap-1.5">
          <Pill>{SOURCE_LABEL[c.source] ?? c.source}</Pill>
          <Pill tone={c.primaryForGoal ? 'indigo' : 'slate'}>{c.primaryForGoal ? 'Primary' : 'Secondary'}</Pill>
          <span className="text-xs text-slate-500">
            {String(c.category).toLowerCase().replaceAll('_', ' ')} · count {c.countingType === 'ONE_PER_CLICK' ? 'one' : 'every'} · ${c.defaultValue}
          </span>
        </span>
      );
    case 'gads_campaign':
      return (
        <span className="text-xs text-slate-600">
          {String(c.channelType).replace('_', ' ').toLowerCase()} · {String(c.biddingStrategy).toLowerCase().replaceAll('_', ' ')} · ${c.dailyBudget}/day
        </span>
      );
    case 'gads_account':
      return (
        <span className="flex flex-wrap gap-1.5">
          <Pill tone={c.autoTaggingEnabled ? 'green' : 'rose'}>Auto-tagging {c.autoTaggingEnabled ? 'on' : 'off'}</Pill>
          <Pill tone={c.enhancedConversionsForLeads ? 'green' : 'slate'}>Enhanced conversions for leads {c.enhancedConversionsForLeads ? 'on' : 'off'}</Pill>
        </span>
      );
    case 'meta_event':
      return (
        <span className="flex flex-wrap items-center gap-1.5">
          {c.receivesBrowser && <Pill>Pixel</Pill>}
          {c.receivesServer && <Pill>CAPI</Pill>}
          {c.emq != null && <Pill tone={c.emq >= 6 ? 'green' : 'amber'}>EMQ {c.emq}</Pill>}
          {c.dedupBrowserPct != null && <Pill tone={c.dedupBrowserPct >= 90 ? 'green' : 'rose'}>Dedup {c.dedupBrowserPct}%</Pill>}
        </span>
      );
    case 'meta_custom_conversion':
      return <span className="font-mono text-xs">event = {c.eventName}{c.ruleConditions ? `; ${c.ruleConditions}` : ''}</span>;
    case 'meta_campaign':
      return <span className="text-xs text-slate-600">optimises for {c.optimisationEvent || byId.get(c.customConversionId)?.name}</span>;
    case 'meta_dataset':
      return <span className="text-xs">First-party cookies {c.firstPartyCookies ? 'on' : 'off'} · automatic matching: {c.automaticMatching}</span>;
    default:
      return null;
  }
}

function flatten(obj: Record<string, unknown>, prefix = ''): [string, unknown][] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v) ? flatten(v as Record<string, unknown>, `${prefix}${k}.`) : [[`${prefix}${k}`, v] as [string, unknown]],
  );
}

function getRaw(snapshotId: string, path: string): unknown {
  const snap = SNAPSHOTS.find((s) => s.id === snapshotId);
  if (!snap) return undefined;
  return path.split('.').reduce<unknown>((o, part) => {
    const m = part.match(/^(\w+)(?:\[(\d+)\])?$/);
    if (!m || !o || typeof o !== 'object') return undefined;
    const v = (o as Record<string, unknown>)[m[1]];
    return m[2] !== undefined ? (v as unknown[])?.[Number(m[2])] : v;
  }, snap.payload);
}

export function ChangeHistory({ events }: { events: ChangeEvent[] }) {
  if (!events.length) return <EmptyState>No changes recorded.</EmptyState>;
  return (
    <ul className="divide-y divide-slate-100">
      {[...events].reverse().map((c) => (
        <li key={c.id} className="group px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-slate-900">{c.summary}</span>
            <AddToChat item={{ kind: 'change', id: c.id }} className="opacity-0 group-hover:opacity-100" />
            {c.kind === 'gtm_publish' && isAppActor(c.actor) && <Badge className="bg-indigo-50 text-indigo-700 ring-indigo-200">Applied from Stack Mapper</Badge>}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {fmtDateTime(c.at)} · {c.actor}
          </div>
          {Array.isArray(c.after) && (
            <ul className="mt-1.5 space-y-0.5 text-xs">
              {(c.after as { entity: string; field: string; value: unknown }[]).map((a, i) => {
                const b = (c.before as { value: unknown }[])?.[i];
                return (
                  <li key={i} className="font-mono text-slate-600">
                    {a.entity} · {a.field}: <span className="text-rose-600 line-through">{String(b?.value ?? '∅')}</span> → <span className="text-emerald-700">{String(a.value ?? '∅')}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {c.entityIds.filter((id) => !id.includes(':container:')).map((id) => (
              <EntityChip key={id} id={id} showTool={false} />
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function EntityPanel({ entityId }: { entityId: string }) {
  const g = useGraph();
  const problems = useProblems();
  const detailed = useDetailed();
  const e = g.byId.get(entityId);
  const [showRaw, setShowRaw] = useState(false);
  if (!e) return <div className="p-6 text-sm text-slate-500">This entity no longer exists.</div>;
  const mine = problems.filter((p) => p.entityIds.includes(e.id) && p.status !== 'fixed' && p.status !== 'dismissed' && p.status !== 'expected');
  const highlight = new Set(mine.flatMap((p) => p.issue?.linkIds ?? []));
  const series = seriesFor(e);
  const related = g.related(e.id);
  const raw = getRaw(e.sourceRef.snapshotId, e.sourceRef.path);

  return (
    <div className="space-y-6 p-6">
      <div className="pr-8">
        <div className="flex flex-wrap items-center gap-2">
          <ToolBadge tool={e.tool} />
          <span className="text-xs text-slate-500">{KIND_LABEL[e.kind]}</span>
          <HealthBadge health={e.health} />
          {e.status !== 'active' && <Badge className="bg-slate-100 text-slate-600 ring-slate-200">{e.status}</Badge>}
        </div>
        <h2 className="mt-2 text-lg font-semibold text-slate-900">{e.name}</h2>
        {detailed && <div className="mt-0.5 font-mono text-xs text-slate-400">ID {e.externalId}</div>}
        <div className="mt-2 text-sm text-slate-600">
          <EntitySummary e={e} byId={g.byId} />
        </div>
        <div className="mt-3">
          <AddToChat item={{ kind: 'entity', id: e.id }} variant="button" />
        </div>
      </div>

      {mine.length > 0 && (
        <div>
          <SectionTitle>Problems</SectionTitle>
          <div className="space-y-1.5">
            {mine.map((p) => (
              <ProblemLink key={p.id} p={p} />
            ))}
          </div>
        </div>
      )}

      {series.length > 0 && (
        <div>
          <SectionTitle>Last 90 days</SectionTitle>
          <MetricChart series={series} height={180} selectFor={e.id} />
        </div>
      )}

      {e.tool !== 'site' && (
        <div>
          <SectionTitle>How data gets here</SectionTitle>
          <Journey entityId={e.id} />
        </div>
      )}

      <Technical summary={`${KIND_LABEL[e.kind]} · ${e.externalId}`}>
        <LineageSections entityId={e.id} highlightLinks={highlight} />

        {related.length > 0 && (
          <div>
            <SectionTitle>Related</SectionTitle>
            <ul className="space-y-1.5">
              {related.map((l) => {
                const other = l.from === e.id ? l.to : l.from;
                const label = l.type === 'uses_variable' ? (l.from === e.id ? 'uses variable' : 'used by') : l.type === 'deduplicates_with' ? 'deduplicated with' : 'linked with';
                return (
                  <li key={l.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-28 shrink-0 text-xs text-slate-500">{label}</span>
                    <EntityChip id={other} />
                    {l.health !== 'healthy' && <HealthDot health={l.health} />}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div>
          <SectionTitle>Configuration (normalised)</SectionTitle>
          <KeyValue
            rows={flatten(e.config).map(([k, v]) => [
              k,
              <span className="font-mono text-xs">
                {Array.isArray(v) ? v.map((x) => g.byId.get(String(x))?.name ?? String(x)).join(', ') || '—' : v === '' || v == null ? '—' : typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v)}
              </span>,
            ])}
          />
        </div>

        <div>
          <button onClick={() => setShowRaw(!showRaw)} className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">
            <ExternalLink size={12} />
            {showRaw ? 'Hide' : 'Show'} raw source data ({e.sourceRef.path})
          </button>
          {showRaw && <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">{JSON.stringify(raw ?? 'Derived entity — no raw source', null, 2)}</pre>}
        </div>
      </Technical>
    </div>
  );
}

export function ToolPage() {
  const { toolId } = useParams<{ toolId: ToolId }>();
  const [params, setParams] = useSearchParams();
  const tools = useStore((s) => s.tools);
  const issues = useStore((s) => s.issues);
  const changeEvents = useStore((s) => s.changeEvents);
  const g = useGraph();
  const problems = useProblems();
  const detailed = useDetailed();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const tool = tools.find((t) => t.id === toolId);
  const tabs = toolId ? TABS[toolId] : undefined;
  const selected = params.get('entity');
  const selectedEntity = selected ? g.byId.get(selected) : undefined;
  const defaultTab = tabs?.find((t) => selectedEntity && t.kinds?.includes(selectedEntity.kind) && (!t.filter || t.filter(selectedEntity)))?.id ?? tabs?.[0].id;
  const tab = params.get('tab') ?? defaultTab;

  const rows = useMemo(() => {
    const def = tabs?.find((t) => t.id === tab);
    if (!def?.kinds) return [];
    return g.entities
      .filter((e) => e.tool === toolId && def.kinds!.includes(e.kind) && (!def.filter || def.filter(e)))
      .map((e) => ({ e, up: g.reachable(e.id, 'up').size, down: g.reachable(e.id, 'down').size }));
  }, [g, tabs, tab, toolId]);

  if (!tool || !tabs || !TOOL_ORDER.includes(toolId!)) return <Navigate to="/" replace />;
  const t = TOOLS[tool.id];
  const def = tabs.find((x) => x.id === tab)!;
  const s = tool.settings as Record<string, unknown>;

  const setTab = (id: string) => {
    setChecked(new Set());
    setParams({ tab: id });
  };
  const toggleRow = (id: string) =>
    setChecked((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toolProblems = problems.filter((p) => p.tools.includes(tool.id) && p.status !== 'fixed' && p.status !== 'dismissed' && p.status !== 'expected' && !p.fyi);
  const open = (id: string) => setParams({ tab: tab!, entity: id });
  const close = () => setParams({ tab: tab! });

  return (
    <div>
      <PageHeader
        title={t.label}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{tool.externalId}</span>
            {tool.lastChangedAt && <span>· last change {fmtDateTime(tool.lastChangedAt)}</span>}
            {toolProblems.length > 0 && (
              <Link to={problemPath(toolProblems[0].id)} className="font-medium text-rose-600 hover:underline">
                · {toolProblems.length} open problem{toolProblems.length > 1 ? 's' : ''}
              </Link>
            )}
          </span>
        }
      />
      <div className="mb-5 flex flex-wrap gap-2">
        {Object.entries(s).map(([k, v]) => (
          <span key={k} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs">
            <span className="text-slate-500">{k.replace(/([A-Z])/g, ' $1').toLowerCase()}:</span>{' '}
            <span className="font-medium text-slate-800">{typeof v === 'boolean' ? (v ? 'on' : 'off') : v == null || v === '' ? '—' : String(v)}</span>
          </span>
        ))}
      </div>

      <Card>
        <div className="px-4 pt-2">
          <Tabs tabs={tabs.map((x) => ({ id: x.id, label: x.label, count: x.kinds ? g.entities.filter((e) => e.tool === tool.id && x.kinds!.includes(e.kind) && (!x.filter || x.filter(e))).length : undefined }))} value={tab!} onChange={setTab} />
        </div>
        {def.history ? (
          <ChangeHistory events={changeEvents.filter((c) => c.tool === tool.id)} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="w-8 py-2 pl-4">
                    <Checkbox
                      label="Select all"
                      checked={rows.length > 0 && rows.every(({ e }) => checked.has(e.id))}
                      onChange={() => setChecked(rows.every(({ e }) => checked.has(e.id)) ? new Set() : new Set(rows.map(({ e }) => e.id)))}
                    />
                  </th>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Details</th>
                  <th className="px-4 py-2 font-medium">Health</th>
                  {detailed && <th className="whitespace-nowrap px-4 py-2 text-right font-medium" title="Entities upstream / downstream">Up / Down</th>}
                  <th className="px-4 py-2 font-medium">Trend</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ e, up, down }) => {
                  const series = seriesFor(e)[0];
                  const n = toolIssueCount(issues, e.id);
                  return (
                    <tr key={e.id} onClick={() => open(e.id)} className={clsx('group cursor-pointer hover:bg-slate-50', (selected === e.id || checked.has(e.id)) && 'bg-indigo-50/50')}>
                      <td className="py-2.5 pl-4">
                        <Checkbox label={`Select ${e.name}`} checked={checked.has(e.id)} onChange={() => toggleRow(e.id)} />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-900">{e.name}</div>
                        {e.status !== 'active' && <div className="text-xs text-slate-400">{e.status}</div>}
                      </td>
                      <td className="max-w-md px-4 py-2.5">
                        <EntitySummary e={e} byId={g.byId} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          <HealthBadge health={e.health} />
                          {n > 0 && <span className="text-xs text-rose-600">{n} issue{n > 1 ? 's' : ''}</span>}
                        </span>
                      </td>
                      {detailed && (
                        <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-slate-600">
                          {up} / {down}
                        </td>
                      )}
                      <td className="px-4 py-2.5">{series && <Sparkline values={series.values.slice(-45)} color={series.color} />}</td>
                      <td className="pr-3">
                        <AddToChat item={{ kind: 'entity', id: e.id }} className="opacity-0 group-hover:opacity-100 focus:opacity-100" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 && <div className="p-4"><EmptyState>Nothing here.</EmptyState></div>}
          </div>
        )}
      </Card>
      <Drawer open={!!selected} onClose={close}>
        {selected && <EntityPanel entityId={selected} />}
      </Drawer>
      <SelectionBar items={[...checked].map((id): ContextItem => ({ kind: 'entity', id }))} onClear={() => setChecked(new Set())} noun={KIND_LABEL[rows[0]?.e.kind ?? 'gtm_tag'].toLowerCase()} />
    </div>
  );
}

function toolIssueCount(issues: ReturnType<typeof useStore.getState>['issues'], entityId: string) {
  return issues.filter((i) => isActiveIssue(i) && i.entityIds.includes(entityId)).length;
}
