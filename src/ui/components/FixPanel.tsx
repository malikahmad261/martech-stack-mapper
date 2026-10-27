import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Clock, Plus, RotateCcw, ShieldCheck, Trash2, UserCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { editableFields, formatValue, getPath, validateOperations, type FieldDef } from '../../engine/fixes';
import { canApplyDirectly } from '../../insights/problems';
import type { Entity, Fix } from '../../model/schema';
import { useEntityMap, useStore } from '../../store';
import { PEOPLE, useRole } from '../../store/ui';
import { KIND_LABEL, TOOLS, fmtDate, fmtDateTime } from '../meta';
import { Button, EmptyState, EntityChip, Modal } from './common';

// The fix workflow inside a problem: a plain summary everyone sees, role-aware actions, and the
// editable diff (the expert layer).

export const RISK: Record<Fix['risk'], { label: string; cls: string; client: string }> = {
  low: { label: 'Low risk', cls: 'text-emerald-700', client: 'Safe to apply yourself' },
  medium: { label: 'Medium risk', cls: 'text-amber-700', client: 'Needs a consultant to approve' },
  high: { label: 'High risk', cls: 'text-rose-700', client: 'Needs a consultant to approve' },
};

/** "GTM Web tag "Meta – Lead": Event ID → {{DLV – event_id}}" */
export function describeOp(o: Fix['current'][number], byId: Map<string, Entity>) {
  const e = byId.get(o.entityId);
  const field = e ? (editableFields(e).find((f) => f.path === o.field)?.label ?? o.field) : o.field;
  return { target: e ? `${TOOLS[e.tool].label} ${KIND_LABEL[e.kind].toLowerCase()} "${e.name}"` : o.entityId, field, to: formatValue(o.to, byId) };
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

/** The editable diff. Read-only for clients and once a fix is applied. */
export function FixChangesEditor({ fix }: { fix: Fix }) {
  const role = useRole();
  const baseEntities = useStore((s) => s.baseEntities);
  const { updateFix, revertFix } = useStore.getState();
  const byId = useEntityMap();
  const baseById = useMemo(() => new Map(baseEntities.map((e) => [e.id, e])), [baseEntities]);
  const [adding, setAdding] = useState<{ entityId: string; field: string } | null>(null);
  const issues = useStore((s) => s.issues).filter((i) => fix.issueIds.includes(i.id));
  const validation = useMemo(() => validateOperations(baseEntities, fix.current), [fix, baseEntities]);
  const locked = fix.status === 'applied' || fix.status === 'rejected' || role === 'client';
  const edited = JSON.stringify(fix.current) !== JSON.stringify(fix.recommended);
  const recommendedById = new Map(fix.recommended.map((o) => [o.id, o]));
  const setOps = (ops: Fix['current']) => updateFix(fix.id, { current: ops });
  const candidates = [...new Set([...fix.current.map((o) => o.entityId), ...fix.recommended.map((o) => o.entityId), ...issues.flatMap((i) => i.entityIds)])]
    .map((eid) => baseById.get(eid))
    .filter((e): e is Entity => !!e && editableFields(e).length > 0);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Proposed changes {edited && <span className="ml-1 normal-case text-amber-700">· edited</span>}
            {role === 'client' && fix.status !== 'applied' && <span className="ml-1 font-normal normal-case text-slate-400">· consultants can edit these</span>}
          </h3>
          {edited && !locked && (
            <Button size="sm" variant="ghost" onClick={() => revertFix(fix.id)}>
              <RotateCcw size={12} /> Revert to recommendation
            </Button>
          )}
        </div>
        {fix.current.length === 0 ? (
          <EmptyState>No configuration changes — this is a manual fix done in the platform.</EmptyState>
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
                          <ValueEditor def={def} value={op.to} entity={target} baseEntities={baseEntities} disabled={locked} onChange={(v) => setOps(fix.current.map((o, j) => (j === idx ? { ...o, to: v } : o)))} />
                        ) : (
                          <span className="font-mono text-xs">{formatValue(op.to, byId)}</span>
                        )}
                        {changedFromRec && rec && !locked && <div className="mt-1 text-[11px] text-amber-700">Recommended: {formatValue(rec.to, byId)}</div>}
                        {!rec && <div className="mt-1 text-[11px] text-indigo-600">Added by a consultant</div>}
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
      {(!locked || fix.notes) && (
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor={`notes-${fix.id}`}>
            Notes {fix.current.some((o) => o.entityId.startsWith('gtm')) && <span className="font-normal normal-case text-slate-400">— used as the GTM version description</span>}
          </label>
          <textarea
            id={`notes-${fix.id}`}
            disabled={locked}
            value={fix.notes}
            onChange={(e) => updateFix(fix.id, { notes: e.target.value })}
            rows={2}
            placeholder="Why you're making this change, ticket reference…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
          />
        </div>
      )}
    </div>
  );
}

export function FixHistory({ fix }: { fix: Fix }) {
  return (
    <ol className="space-y-1.5 border-l border-slate-200 pl-4 text-xs">
      {fix.history.map((h, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-slate-300" />
          <span className="font-medium text-slate-700">{h.action}</span> <span className="text-slate-500">· {h.by} · {fmtDateTime(h.at)}</span>
        </li>
      ))}
    </ol>
  );
}

/** The "How to fix" card: what will change in plain words, and what this person can do about it. */
export function FixCard({ fix }: { fix: Fix }) {
  const role = useRole();
  const byId = useEntityMap();
  const baseEntities = useStore((s) => s.baseEntities);
  const changeEvents = useStore((s) => s.changeEvents);
  const { setFixStatus, applyFix, approveAndApply, requestReview } = useStore.getState();
  const [confirm, setConfirm] = useState(false);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const validation = useMemo(() => validateOperations(baseEntities, fix.current), [fix, baseEntities]);
  const hasErrors = Object.keys(validation.errors).length > 0;
  const manual = fix.current.length === 0;
  const applied = changeEvents.filter((c) => c.id.includes(`:fix:${fix.id}:`));
  const direct = canApplyDirectly(role, fix);
  const ops = fix.current.map((o) => describeOp(o, byId));
  const consultant = PEOPLE.consultant.name;
  const applyLabel = manual ? 'Mark as done' : 'Apply fix';
  const doApply = () => (fix.status === 'approved' ? applyFix(fix.id) : approveAndApply(fix.id));

  return (
    <div className={clsx('rounded-xl border p-4', fix.status === 'applied' ? 'border-emerald-200 bg-emerald-50/40' : 'border-indigo-200 bg-indigo-50/40')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">How to fix it</div>
        <div className={clsx('flex items-center gap-1 text-xs font-medium', RISK[fix.risk].cls)}>
          <ShieldCheck size={13} /> {RISK[fix.risk].label}
          {role === 'client' && fix.status !== 'applied' && <span className="font-normal text-slate-500">· {RISK[fix.risk].client}</span>}
        </div>
      </div>
      <div className="mt-1 font-medium text-slate-900">{fix.title}</div>
      <p className="mt-1 text-sm text-slate-600">{fix.rationale}</p>

      {manual ? (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-700">
          {fix.manualSteps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      ) : (
        <ul className="mt-3 space-y-1 text-sm">
          {ops.slice(0, 4).map((o, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-1.5 text-slate-700">
              <span className="text-slate-500">{o.target}:</span>
              <span>{o.field}</span>
              <span className="text-slate-400">→</span>
              <code className="rounded bg-white px-1 font-mono text-xs text-emerald-700 ring-1 ring-slate-200">{o.to}</code>
            </li>
          ))}
          {ops.length > 4 && <li className="text-xs text-slate-500">…and {ops.length - 4} more changes (see technical details)</li>}
        </ul>
      )}

      {fix.reviewRequest && fix.status !== 'applied' && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-800">
          <UserCheck size={15} className="mt-0.5 shrink-0" />
          <span>
            {role === 'client' ? `You asked ${consultant} to review this` : `${fix.reviewRequest.by} asked for a review`} on {fmtDate(fix.reviewRequest.at)}
            {fix.reviewRequest.note && <span className="text-violet-700">: “{fix.reviewRequest.note}”</span>}
            {fix.status === 'approved' && ' — approved.'}
          </span>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {fix.status === 'applied' ? (
          <div className="flex items-center gap-1.5 text-sm text-emerald-700">
            <CheckCircle2 size={15} /> {manual ? 'Marked as done' : 'Applied'}. {applied.map((c) => c.summary).join(' · ')}
          </div>
        ) : fix.status === 'rejected' ? (
          <>
            <span className="text-sm text-slate-500">This fix was rejected.</span>
            {role === 'consultant' && <Button onClick={() => setFixStatus(fix.id, 'draft')}>Restore</Button>}
          </>
        ) : role === 'consultant' ? (
          fix.status === 'approved' ? (
            <>
              <Button variant="success" onClick={() => setConfirm(true)}>
                {manual ? 'Mark as done' : 'Apply now'}
              </Button>
              <Button variant="ghost" onClick={() => setFixStatus(fix.id, 'draft')}>
                Back to review
              </Button>
            </>
          ) : (
            <>
              <Button variant="primary" disabled={hasErrors} onClick={() => setFixStatus(fix.id, 'approved')} title={hasErrors ? 'Fix the validation errors first' : undefined}>
                Approve
              </Button>
              <Button variant="ghost" onClick={() => setFixStatus(fix.id, 'rejected')}>
                Reject
              </Button>
              <span className="text-xs text-slate-500">{hasErrors ? 'Resolve the errors in technical details to approve.' : 'Edit the proposed values in technical details before approving.'}</span>
            </>
          )
        ) : direct || fix.status === 'approved' ? (
          <>
            <Button variant="success" disabled={hasErrors} onClick={() => setConfirm(true)}>
              {applyLabel}
            </Button>
            <Button variant="ghost" onClick={() => setAsking(true)} disabled={!!fix.reviewRequest}>
              {fix.reviewRequest ? 'Review requested' : `Ask ${consultant} first`}
            </Button>
          </>
        ) : fix.reviewRequest ? (
          <span className="flex items-center gap-1.5 text-sm text-slate-600">
            <Clock size={14} /> Waiting for {consultant} to review
          </span>
        ) : (
          <Button variant="primary" onClick={() => setAsking(true)}>
            <UserCheck size={14} /> Request review from {consultant}
          </Button>
        )}
      </div>

      {fix.verifyAfter.length > 0 && fix.status !== 'rejected' && (
        <div className="mt-4 border-t border-indigo-100 pt-3">
          <div className="mb-1 text-xs font-medium text-slate-500">{fix.status === 'applied' ? 'Check that it worked' : 'After applying, check'}</div>
          <ul className="space-y-1 text-sm text-slate-700">
            {fix.verifyAfter.map((s) => (
              <li key={s} className="flex gap-2">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-slate-400" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={manual ? 'Mark this fix as done?' : 'Apply this fix?'}
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>Cancel</Button>
            <Button
              variant="success"
              onClick={() => {
                doApply();
                setConfirm(false);
              }}
            >
              {manual ? 'Mark as done' : 'Apply (simulated)'}
            </Button>
          </>
        }
      >
        {manual ? (
          <p className="text-sm text-slate-600">Confirm you've completed the steps in the platform. The problem will show as fixed and be confirmed when the next data arrives.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-600">
              These changes will be applied{fix.current.some((o) => o.entityId.startsWith('gtm')) ? ' and published as a new GTM container version' : ''}. In the prototype nothing is sent to any platform.
            </p>
            <ul className="space-y-1.5 text-xs">
              {fix.current.map((o) => {
                const t = byId.get(o.entityId);
                const d = describeOp(o, byId);
                return (
                  <li key={o.id} className="rounded bg-slate-50 p-2 font-mono">
                    <div className="font-sans font-medium text-slate-800">
                      {d.target} — {d.field}
                    </div>
                    <span className="text-rose-600 line-through">{formatValue(t ? getPath(t.config, o.field) : o.from, byId)}</span> → <span className="text-emerald-700">{d.to}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Modal>

      <Modal
        open={asking}
        onClose={() => setAsking(false)}
        title={`Ask ${consultant} to review this fix`}
        footer={
          <>
            <Button onClick={() => setAsking(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                requestReview(fix.id, note.trim());
                setAsking(false);
                setNote('');
              }}
            >
              Send request
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-600">
          {fix.risk === 'low' ? 'This fix is low risk, but you can still ask for a second opinion.' : `This fix is ${fix.risk} risk, so a consultant needs to approve it before it's applied.`} {consultant} will see it at the top of their review list.
        </p>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Anything they should know? (optional)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      </Modal>
    </div>
  );
}
