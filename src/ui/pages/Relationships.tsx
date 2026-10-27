import clsx from 'clsx';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FLOW_LABELS, LINK_FLOW } from '../../engine/graph';
import { worstHealth } from '../../engine/scan';
import type { Health, LinkType, ToolId } from '../../model/schema';
import { useStore } from '../../store';
import { Card, EmptyState, EntityChip, HealthBadge, PageHeader, Tabs } from '../components/common';
import { useGraph } from '../components/Lineage';
import { isActiveIssue } from '../derive';
import { HEALTH, KIND_LABEL, TOOLS, TOOL_ORDER } from '../meta';

function Select<T extends string>({ value, onChange, options, label }: { value: T | ''; onChange: (v: T | '') => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-500">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as T | '')} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800">
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Relationships() {
  const [params, setParams] = useSearchParams();
  const g = useGraph();
  const issues = useStore((s) => s.issues);
  const view = (params.get('view') as 'links' | 'matrix' | 'impact') ?? 'links';
  const from = (params.get('from') ?? '') as ToolId | '';
  const to = (params.get('to') ?? '') as ToolId | '';
  const type = (params.get('type') ?? '') as LinkType | '';
  const health = (params.get('health') ?? '') as Health | '';
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p);
  };

  // Present every link in data-flow order (source → destination).
  const rows = useMemo(
    () =>
      g.links.map((l) => {
        const [src, dst] = LINK_FLOW[l.type] === 'reverse' ? [l.to, l.from] : [l.from, l.to];
        const label = FLOW_LABELS[l.type];
        return { l, src: g.byId.get(src)!, dst: g.byId.get(dst)!, label, issues: issues.filter((i) => isActiveIssue(i) && i.linkIds.includes(l.id)).length };
      }),
    [g, issues],
  );
  const filtered = rows.filter((r) => (!from || r.src.tool === from) && (!to || r.dst.tool === to) && (!type || r.l.type === type) && (!health || r.l.health === health));

  return (
    <div>
      <PageHeader
        title="Relationships & dependencies"
        subtitle="Every link between entities across the stack, inferred from each tool's configuration. Links are listed in data-flow order: where data comes from → where it goes."
      />
      <Card>
        <div className="px-4 pt-2">
          <Tabs
            tabs={[
              { id: 'links', label: 'All links', count: g.links.length },
              { id: 'matrix', label: 'Tool matrix' },
              { id: 'impact', label: 'Dependency impact' },
            ]}
            value={view}
            onChange={(v) => set('view', v === 'links' ? '' : v)}
          />
        </div>

        {view === 'links' && (
          <>
            <div className="flex flex-wrap gap-3 border-b border-slate-100 px-4 py-3">
              <Select label="From tool" value={from} onChange={(v) => set('from', v)} options={TOOL_ORDER.map((t) => ({ value: t, label: TOOLS[t].label }))} />
              <Select label="To tool" value={to} onChange={(v) => set('to', v)} options={TOOL_ORDER.map((t) => ({ value: t, label: TOOLS[t].label }))} />
              <Select label="Relationship" value={type} onChange={(v) => set('type', v)} options={(Object.keys(FLOW_LABELS) as LinkType[]).map((t) => ({ value: t, label: FLOW_LABELS[t] }))} />
              <Select label="Health" value={health} onChange={(v) => set('health', v)} options={(['healthy', 'degraded', 'broken', 'inactive'] as Health[]).map((h) => ({ value: h, label: HEALTH[h].label }))} />
              <div className="ml-auto self-end text-xs text-slate-500">{filtered.length} links</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr className="border-b border-slate-100">
                    <th className="px-4 py-2 font-medium">Source</th>
                    <th className="px-4 py-2 font-medium">Relationship</th>
                    <th className="px-4 py-2 font-medium">Target</th>
                    <th className="px-4 py-2 font-medium">Health</th>
                    <th className="px-4 py-2 font-medium">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((r) => (
                    <tr key={r.l.id} className="align-top">
                      <td className="px-4 py-2">
                        <EntityChip entity={r.src} showKind />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-600">{r.label}</td>
                      <td className="px-4 py-2">
                        <EntityChip entity={r.dst} showKind />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <HealthBadge health={r.l.health} />
                        {r.issues > 0 && <div className="mt-1 text-xs text-rose-600">{r.issues} issue{r.issues > 1 ? 's' : ''}</div>}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-500">{r.l.evidence.join(' · ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="p-4">
                  <EmptyState>No links match these filters.</EmptyState>
                </div>
              )}
            </div>
          </>
        )}

        {view === 'matrix' && <Matrix rows={rows} onPick={(f, t) => setParams({ from: f, to: t })} />}
        {view === 'impact' && <Impact />}
      </Card>
    </div>
  );
}

function Matrix({ rows, onPick }: { rows: { src: { tool: ToolId }; dst: { tool: ToolId }; l: { health: Health } }[]; onPick: (from: ToolId, to: ToolId) => void }) {
  return (
    <div className="overflow-x-auto p-4">
      <table className="border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th className="px-2 text-left text-xs font-medium text-slate-400">from ↓ / to →</th>
            {TOOL_ORDER.map((t) => (
              <th key={t} className="px-2 py-1 text-xs font-semibold" style={{ color: TOOLS[t].color }}>
                {TOOLS[t].short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TOOL_ORDER.map((a) => (
            <tr key={a}>
              <th className="whitespace-nowrap px-2 text-left text-xs font-semibold" style={{ color: TOOLS[a].color }}>
                {TOOLS[a].label}
              </th>
              {TOOL_ORDER.map((b) => {
                const cell = rows.filter((r) => r.src.tool === a && r.dst.tool === b);
                const h = cell.length ? worstHealth(cell.map((r) => r.l.health)) : null;
                return (
                  <td key={b}>
                    <button
                      disabled={!cell.length}
                      onClick={() => onPick(a, b)}
                      className={clsx('h-14 w-20 rounded-lg text-center ring-1 ring-inset transition', cell.length ? `${HEALTH[h!].badge} hover:brightness-95` : 'bg-slate-50 text-slate-300 ring-slate-100')}
                    >
                      <div className="text-base font-semibold tabular-nums">{cell.length || '·'}</div>
                      {h && <div className="text-[10px]">{HEALTH[h].label}</div>}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-slate-500">Diagonal cells are links within a tool (e.g. tag → trigger). Colour shows the worst health in each cell; click a cell to list its links.</p>
    </div>
  );
}

function Impact() {
  const g = useGraph();
  const [params, setParams] = useSearchParams();
  const selected = params.get('entity') ?? 'gtm_web:trigger:3';
  const candidates = g.entities.filter((e) => ['gtm_trigger', 'gtm_tag', 'gtm_client', 'datalayer_event', 'ga4_event', 'gtm_variable'].includes(e.kind));
  const down = [...g.reachable(selected, 'down')].map((id) => g.byId.get(id)!).filter(Boolean);
  const byTool = TOOL_ORDER.map((t) => ({ t, items: down.filter((e) => e.tool === t) })).filter((x) => x.items.length);
  const sel = g.byId.get(selected);
  return (
    <div className="p-4">
      <label className="flex max-w-lg flex-col gap-1 text-xs text-slate-500">
        If this breaks…
        <select
          value={selected}
          onChange={(e) => setParams({ view: 'impact', entity: e.target.value })}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800"
        >
          {TOOL_ORDER.map((t) => (
            <optgroup key={t} label={TOOLS[t].label}>
              {candidates
                .filter((e) => e.tool === t)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {KIND_LABEL[e.kind]}: {e.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      {sel && (
        <div className="mt-4">
          <p className="text-sm text-slate-700">
            <strong>{down.length}</strong> entities across <strong>{byTool.length}</strong> tools depend on <EntityChip entity={sel} />
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {byTool.map(({ t, items }) => (
              <div key={t} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 text-xs font-semibold" style={{ color: TOOLS[t].color }}>
                  {TOOLS[t].label} · {items.length}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((e) => (
                    <EntityChip key={e.id} entity={e} showTool={false} showKind />
                  ))}
                </div>
              </div>
            ))}
          </div>
          {down.length === 0 && <EmptyState>Nothing downstream depends on this.</EmptyState>}
        </div>
      )}
    </div>
  );
}
