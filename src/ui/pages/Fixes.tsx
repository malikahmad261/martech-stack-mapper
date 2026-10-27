import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ChevronRight, Info, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { editableFields, formatValue, getPath, validateOperations, type FieldDef } from '../../engine/fixes';
import { ACTOR } from '../../engine/workflow';
import type { Entity, Fix, FixOperation } from '../../model/schema';
import { useEntityMap, useStore } from '../../store';
import { Badge, Button, Card, Drawer, EmptyState, EntityChip, Modal, PageHeader, SeverityBadge, Tabs } from '../components/common';
import { TOOLS, fmtDateTime } from '../meta';

const STATUS: Record<Fix['status'], { label: string; cls: string }> = {
  draft: { label: 'Recommended', cls: 'bg-white text-slate-700 ring-slate-300' },
  edited: { label: 'Edited', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  approved: { label: 'Approved', cls: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  applied: { label: 'Applied', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  rejected: { label: 'Rejected', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
};

function Banner() {
  return (
    <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
      <Info size={16} className="mt-0.5 shrink-0" />
      <span>
        <strong>Prototype</strong> — changes are simulated and not sent to any platform. Applying a fix updates the demo data, publishes a new container version where relevant and re-checks the stack.
      </span>
    </div>
  );
}

export function Fixes() {
  const [params, setParams] = useSearchParams();
  const fixes = useStore((s) => s.fixes);
  const issues = useStore((s) => s.issues);
  const changeEvents = useStore((s) => s.changeEvents);
  const view = params.get('view') ?? 'review';
  const selected = params.get('id');
  const issueById = useMemo(() => new Map(issues.map((i) => [i.id, i])), [issues]);
  // Fixes superseded by a newer recommendation for the same issue are hidden from review.
  const live = fixes.filter((f) => f.status === 'applied' || f.issueIds.some((id) => issueById.get(id)?.fixId === f.id));
  const groups: Record<string, Fix[]> = {
    review: live.filter((f) => f.status === 'draft' || f.status === 'edited'),
    approved: live.filter((f) => f.status === 'approved'),
    applied: live.filter((f) => f.status === 'applied'),
    rejected: live.filter((f) => f.status === 'rejected'),
  };
  const log = changeEvents.filter((c) => c.actor === ACTOR).reverse();
  const sevRank = (f: Fix) => Math.min(...f.issueIds.map((id) => ['critical', 'high', 'medium', 'low'].indexOf(issueById.get(id)?.severity ?? 'low')));
  const list = (groups[view] ?? []).slice().sort((a, b) => sevRank(a) - sevRank(b));

  return (
    <div>
      <PageHeader title="Fix queue" subtitle="Every issue comes with a recommended fix. Review it, edit anything you want changed, approve it, then apply it." />
      <Banner />
      <Card>
        <div className="px-4 pt-2">
          <Tabs
            value={view}
            onChange={(v) => setParams(v === 'review' ? {} : { view: v })}
            tabs={[
              { id: 'review', label: 'To review', count: groups.review.length },
              { id: 'approved', label: 'Approved', count: groups.approved.length },
              { id: 'applied', label: 'Applied', count: groups.applied.length },
              { id: 'rejected', label: 'Rejected', count: groups.rejected.length },
              { id: 'log', label: 'Change log', count: log.length },
            ]}
          />
        </div>
        {view === 'log' ? (
          log.length === 0 ? (
            <div className="p-4">
              <EmptyState>No fixes applied yet.</EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {log.map((c) => (
                <li key={c.id} className="px-4 py-3">
                  <div className="text-sm font-medium text-slate-900">{c.summary}</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {TOOLS[c.tool].label} · {fmtDateTime(c.at)}
                  </div>
                  <ul className="mt-1.5 space-y-0.5 text-xs">
                    {(c.after as { entity: string; field: string; value: string }[]).map((a, i) => (
                      <li key={i} className="font-mono text-slate-600">
                        {a.entity} · {a.field}: <span className="text-rose-600 line-through">{(c.before as { value: string }[])[i]?.value}</span> → <span className="text-emerald-700">{a.value}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )
        ) : list.length === 0 ? (
          <div className="p-4">
            <EmptyState>Nothing here.</EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((f) => {
              const fi = f.issueIds.map((id) => issueById.get(id)).filter(Boolean);
              return (
                <li key={f.id}>
                  <button onClick={() => setParams({ ...(view !== 'review' ? { view } : {}), id: f.id })} className={clsx('flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50', selected === f.id && 'bg-indigo-50/50')}>
                    {fi[0] && <SeverityBadge severity={fi[0].severity} />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-900">{f.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        Resolves: {fi.map((i) => i!.title).join(' · ')}
                      </span>
                    </span>
                    <span className="hidden text-xs text-slate-400 sm:block">{f.current.length ? `${f.current.length} change${f.current.length > 1 ? 's' : ''}` : 'Manual'}</span>
                    <Badge className={STATUS[f.status].cls}>{STATUS[f.status].label}</Badge>
                    <ChevronRight size={16} className="mt-0.5 shrink-0 text-slate-300" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Drawer open={!!selected} onClose={() => setParams(view !== 'review' ? { view } : {})} wide>
        {selected && <FixDetail id={selected} />}
      </Drawer>
    </div>
  );
}

function ValueEditor({ def, value, onChange, entity, baseEntities, disabled }: { def: FieldDef; value: unknown; onChange: (v: unknown) => void; entity: Entity; baseEntities: Entity[]; disabled: boolean }) {
  const input = 'w-full rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-800 disabled:bg-slate-50';
  switch (def.type) {
    case 'boolean':
      return (
        <button
          disabled={disabled}
          onClick={() => onChange(!value)}
          className={clsx('relative h-5 w-9 rounded-full transition disabled:opacity-60', value ? 'bg-indigo-600' : 'bg-slate-300')}
          aria-pressed={!!value}
        >
          <span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition', value ? 'left-[18px]' : 'left-0.5')} />
        </button>
      );
    case 'enum':
      return (
        <select disabled={disabled} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={input}>
          {!def.options!.includes(String(value)) && <option value={String(value ?? '')}>{String(value || '(empty)')}</option>}
          {def.options!.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
    case 'number':
      return <input disabled={disabled} type="number" value={String(value ?? '')} onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))} className={input} />;
    case 'triggerRefs': {
      const ids = (value as string[]) ?? [];
      const triggers = baseEntities.filter((e) => e.kind === 'gtm_trigger' && e.tool === entity.tool);
      return (
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1">
            {ids.map((id) => (
              <span key={id} className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                {triggers.find((t) => t.id === id)?.name ?? 'deleted trigger'}
                {!disabled && (
                  <button onClick={() => onChange(ids.filter((x) => x !== id))} className="text-slate-400 hover:text-rose-600" aria-label="Remove trigger">
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
          {!disabled && (
            <select value="" onChange={(e) => e.target.value && onChange([...ids, e.target.value])} className={input}>
              <option value="">+ Add trigger…</option>
              {triggers
                .filter((t) => !ids.includes(t.id))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          )}
        </div>
      );
    }
    default: {
      const listId = `opts-${entity.id}-${def.path}`;
      const options =
        def.type === 'varRef'
          ? baseEntities.filter((e) => e.kind === 'gtm_variable' && e.tool === entity.tool).map((v) => `{{${v.name}}}`)
          : def.path === 'customEventName'
            ? baseEntities.filter((e) => e.kind === 'datalayer_event').map((e) => e.name)
            : [];
      return (
        <>
          <input disabled={disabled} list={listId} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={input} placeholder={def.type === 'varRef' ? '{{Variable name}}' : ''} />
          <datalist id={listId}>
            {options.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </>
      );
    }
  }
}

function FixDetail({ id }: { id: string }) {
  const fix = useStore((s) => s.fixes.find((f) => f.id === id));
  const allIssues = useStore((s) => s.issues);
  const baseEntities = useStore((s) => s.baseEntities);
  const changeEvents = useStore((s) => s.changeEvents);
  const { updateFix, revertFix, setFixStatus, applyFix } = useStore.getState();
  const byId = useEntityMap();
  const baseById = useMemo(() => new Map(baseEntities.map((e) => [e.id, e])), [baseEntities]);
  const [confirm, setConfirm] = useState(false);
  const [adding, setAdding] = useState<{ entityId: string; field: string } | null>(null);
  const validation = useMemo(() => (fix ? validateOperations(baseEntities, fix.current) : { errors: {}, warnings: {} }), [fix, baseEntities]);
  if (!fix) return <div className="p-6 text-sm text-slate-500">Fix not found.</div>;

  const issues = allIssues.filter((i) => fix.issueIds.includes(i.id));
  const locked = fix.status === 'applied' || fix.status === 'rejected';
  const hasErrors = Object.keys(validation.errors).length > 0;
  const edited = JSON.stringify(fix.current) !== JSON.stringify(fix.recommended);
  const recommendedById = new Map(fix.recommended.map((o) => [o.id, o]));
  const setOps = (ops: FixOperation[]) => updateFix(fix.id, { current: ops });
  const applied = changeEvents.filter((c) => c.id.includes(`:fix:${fix.id}:`));

  // Entities you can add changes for: everything this fix or its issues touch that has editable fields.
  const candidates = [...new Set([...fix.current.map((o) => o.entityId), ...fix.recommended.map((o) => o.entityId), ...issues.flatMap((i) => i.entityIds)])]
    .map((eid) => baseById.get(eid))
    .filter((e): e is Entity => !!e && editableFields(e).length > 0);

  return (
    <div className="space-y-6 p-6">
      <div className="pr-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={STATUS[fix.status].cls}>{STATUS[fix.status].label}</Badge>
          <Badge className={fix.risk === 'low' ? 'bg-slate-100 text-slate-600 ring-slate-200' : fix.risk === 'medium' ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-rose-50 text-rose-700 ring-rose-200'}>{fix.risk} risk</Badge>
        </div>
        <h2 className="mt-2 text-lg font-semibold text-slate-900">{fix.title}</h2>
        <p className="mt-1 text-sm text-slate-600">{fix.rationale}</p>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Resolves</h3>
        <ul className="space-y-1.5">
          {issues.map((i) => (
            <li key={i.id}>
              <Link to={`/issues?id=${encodeURIComponent(i.id)}`} className="flex items-start gap-2 rounded-lg border border-slate-200 p-2.5 text-sm hover:border-slate-400">
                <SeverityBadge severity={i.severity} />
                <span className="flex-1">{i.title}</span>
                <ChevronRight size={16} className="text-slate-400" />
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Proposed changes {edited && <span className="ml-1 normal-case text-amber-700">· edited</span>}</h3>
          {edited && !locked && (
            <Button size="sm" variant="ghost" onClick={() => revertFix(fix.id)}>
              <RotateCcw size={12} /> Revert to recommendation
            </Button>
          )}
        </div>
        {fix.current.length === 0 ? (
          <EmptyState>No configuration changes — this is a manual fix. Follow the steps below, then mark it as done.</EmptyState>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Target</th>
                  <th className="px-3 py-2 font-medium">Field</th>
                  <th className="px-3 py-2 font-medium">Current</th>
                  <th className="px-3 py-2 font-medium">New value</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top">
                {fix.current.map((op, idx) => {
                  const target = baseById.get(op.entityId);
                  const def = target ? editableFields(target).find((f) => f.path === op.field) : undefined;
                  const rec = recommendedById.get(op.id);
                  const changedFromRec = !rec || JSON.stringify(rec.to) !== JSON.stringify(op.to);
                  return (
                    <tr key={op.id}>
                      <td className="px-3 py-2">
                        <EntityChip id={op.entityId} />
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">{def?.label ?? op.field}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">{formatValue(target ? getPath(target.config, op.field) : op.from, byId)}</td>
                      <td className="min-w-[200px] px-3 py-2">
                        {def && target ? (
                          <ValueEditor
                            def={def}
                            value={op.to}
                            entity={target}
                            baseEntities={baseEntities}
                            disabled={locked}
                            onChange={(v) => setOps(fix.current.map((o, j) => (j === idx ? { ...o, to: v } : o)))}
                          />
                        ) : (
                          <span className="font-mono text-xs">{formatValue(op.to, byId)}</span>
                        )}
                        {changedFromRec && rec && !locked && <div className="mt-1 text-[11px] text-amber-700">Recommended: {formatValue(rec.to, byId)}</div>}
                        {!rec && <div className="mt-1 text-[11px] text-indigo-600">Added by you</div>}
                        {validation.errors[op.id] && (
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-rose-600">
                            <AlertTriangle size={11} /> {validation.errors[op.id]}
                          </div>
                        )}
                        {validation.warnings[op.id] && <div className="mt-1 text-[11px] text-amber-700">{validation.warnings[op.id]}</div>}
                      </td>
                      <td className="px-2 py-2">
                        {!locked && (
                          <button onClick={() => setOps(fix.current.filter((_, j) => j !== idx))} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove change">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!locked && candidates.length > 0 && (
          <div className="mt-2">
            {adding ? (
              <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-slate-300 p-2.5">
                <label className="flex flex-col gap-1 text-xs text-slate-500">
                  Target
                  <select value={adding.entityId} onChange={(e) => setAdding({ entityId: e.target.value, field: '' })} className="rounded-md border border-slate-200 px-2 py-1 text-sm">
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {TOOLS[c.tool].short} · {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-500">
                  Field
                  <select value={adding.field} onChange={(e) => setAdding({ ...adding, field: e.target.value })} className="rounded-md border border-slate-200 px-2 py-1 text-sm">
                    <option value="">Choose…</option>
                    {editableFields(baseById.get(adding.entityId)!)
                      .filter((f) => !fix.current.some((o) => o.entityId === adding.entityId && o.field === f.path))
                      .map((f) => (
                        <option key={f.path} value={f.path}>
                          {f.label}
                        </option>
                      ))}
                  </select>
                </label>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!adding.field}
                  onClick={() => {
                    const target = baseById.get(adding.entityId)!;
                    const value = getPath(target.config, adding.field);
                    setOps([...fix.current, { id: `${fix.id}:user${Date.now()}`, entityId: adding.entityId, field: adding.field, op: 'set', from: value, to: value }]);
                    setAdding(null);
                  }}
                >
                  Add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAdding(null)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setAdding({ entityId: candidates[0].id, field: '' })}>
                <Plus size={12} /> Add a change
              </Button>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="fix-notes">
          Notes {fix.current.some((o) => o.entityId.startsWith('gtm')) && <span className="font-normal normal-case text-slate-400">— used as the GTM version description</span>}
        </label>
        <textarea
          id="fix-notes"
          disabled={locked}
          value={fix.notes}
          onChange={(e) => updateFix(fix.id, { notes: e.target.value })}
          rows={2}
          placeholder="Why you're making this change, ticket reference…"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Steps in the platform</h3>
          <ol className="list-decimal space-y-1 pl-4 text-sm text-slate-700">
            {fix.manualSteps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Check after applying</h3>
          <ul className="space-y-1 text-sm text-slate-700">
            {fix.verifyAfter.map((s) => (
              <li key={s} className="flex gap-2">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-slate-400" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        {(fix.status === 'draft' || fix.status === 'edited') && (
          <>
            <Button variant="primary" disabled={hasErrors} onClick={() => setFixStatus(fix.id, 'approved')} title={hasErrors ? 'Fix the validation errors first' : undefined}>
              Approve
            </Button>
            <Button variant="ghost" onClick={() => setFixStatus(fix.id, 'rejected')}>
              Reject
            </Button>
            {hasErrors && <span className="text-xs text-rose-600">Resolve the errors above to approve.</span>}
          </>
        )}
        {fix.status === 'approved' && (
          <>
            <Button variant="success" onClick={() => setConfirm(true)}>
              {fix.current.length ? 'Apply now' : 'Mark as done'}
            </Button>
            <Button variant="ghost" onClick={() => setFixStatus(fix.id, 'draft')}>
              Back to review
            </Button>
          </>
        )}
        {fix.status === 'rejected' && <Button onClick={() => setFixStatus(fix.id, 'draft')}>Restore</Button>}
        {fix.status === 'applied' && (
          <div className="text-sm text-emerald-700">
            <CheckCircle2 size={14} className="mr-1 inline" />
            Applied. {applied.map((c) => c.summary).join(' · ')}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">History</h3>
        <ol className="space-y-1.5 border-l border-slate-200 pl-4 text-xs">
          {fix.history.map((h, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-slate-300" />
              <span className="font-medium text-slate-700">{h.action}</span> <span className="text-slate-500">· {h.by} · {fmtDateTime(h.at)}</span>
            </li>
          ))}
        </ol>
      </div>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={fix.current.length ? 'Apply this fix?' : 'Mark this manual fix as done?'}
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>Cancel</Button>
            <Button
              variant="success"
              onClick={() => {
                applyFix(fix.id);
                setConfirm(false);
              }}
            >
              {fix.current.length ? 'Apply (simulated)' : 'Mark as done'}
            </Button>
          </>
        }
      >
        {fix.current.length ? (
          <>
            <p className="mb-3 text-sm text-slate-600">These changes will be applied to the demo data{fix.current.some((o) => o.entityId.startsWith('gtm')) ? ' and published as a new GTM container version' : ''}:</p>
            <ul className="space-y-1.5 text-xs">
              {fix.current.map((o) => {
                const t = baseById.get(o.entityId);
                return (
                  <li key={o.id} className="rounded bg-slate-50 p-2 font-mono">
                    <div className="font-sans font-medium text-slate-800">
                      {t ? `${TOOLS[t.tool].short} · ${t.name}` : o.entityId} — {t ? editableFields(t).find((f) => f.path === o.field)?.label : o.field}
                    </div>
                    <span className="text-rose-600 line-through">{formatValue(t ? getPath(t.config, o.field) : o.from, byId)}</span> → <span className="text-emerald-700">{formatValue(o.to, byId)}</span>
                  </li>
                );
              })}
            </ul>
            {fix.notes && <p className="mt-3 text-xs text-slate-500">Notes: {fix.notes}</p>}
          </>
        ) : (
          <p className="text-sm text-slate-600">Confirm you've completed the steps in the platform. The issue will show as resolved and be verified when the next data arrives.</p>
        )}
      </Modal>
    </div>
  );
}
