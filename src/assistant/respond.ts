import type { Entity } from '../model/schema';
import { CELL_STATE, PLATFORMS } from '../insights/conversions';
import { SEVERITY_PLAIN } from '../insights/plain';
import { canApplyDirectly, isActiveProblem, type Problem } from '../insights/problems';
import { contextKey, fmtShort, kindName, metricSeries, pathStrings, resolveContext, toolName, type AssistantData, type ContextItem } from './context';

// Scripted assistant for the prototype (no LLM). It recognises a handful of intents and answers
// from the selected context and the live demo data, so answers stay true after fixes are applied.
// The agent never changes anything itself: its actions only navigate or add context.

export interface ChatAction {
  label: string;
  to?: string;
  add?: ContextItem[];
}

export interface AssistantReply {
  steps: string[];
  text: string;
  actions: ChatAction[];
}

export type Intent = 'attention' | 'changes' | 'summary' | 'fix' | 'impact' | 'lineage' | 'cause' | 'compare' | 'config' | 'explain';

const INTENTS: [Intent, RegExp][] = [
  ['summary', /summar|email|client update|status update|write (an? )?update|report for/],
  ['attention', /attention|priorit|first|focus|urgent|worst|most important|what('s| is) (broken|wrong)/],
  ['changes', /what changed|recent change|change log|changes this|who changed|been published/],
  ['fix', /\bfix|resolve|repair|how (do|can|should) (i|we)|draft|next step/],
  ['impact', /impact|cost|matter|business|how bad|serious|losing/],
  ['lineage', /depend|downstream|upstream|lineage|flow|connected|where .*(come|go)|if (this|it) breaks|breaks/],
  ['cause', /why|cause|reason|drop|spike|happen/],
  ['compare', /compar|versus|\bvs\b|previous|before|trend/],
  ['config', /set ?up|config|correct|settings|valid|right\?/],
  ['explain', /explain|what is|what's|what does|mean|plain english|tell me|describe|about/],
];

export function detectIntent(prompt: string): Intent | null {
  const p = prompt.toLowerCase();
  return INTENTS.find(([, re]) => re.test(p))?.[0] ?? null;
}

const pct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}%`;
const n = (x: number) => (Math.abs(x) >= 10 ? Math.round(x).toLocaleString('en-US') : String(Math.round(x * 10) / 10));
const firstSentence = (s: string) => s.split('. ')[0].replace(/\.$/, '');
const problemLink = (p: Problem): ChatAction => ({ label: `Open "${trim(p.headline, 40)}"`, to: `/problems/${encodeURIComponent(p.id)}` });
const trim = (s: string, len: number) => (s.length > len ? `${s.slice(0, len - 1)}…` : s);
const active = (d: AssistantData) => d.problems.filter((p) => isActiveProblem(p) && !p.fyi);

export function respond(prompt: string, items: ContextItem[], d: AssistantData): AssistantReply {
  const intent = detectIntent(prompt) ?? (items.length ? 'explain' : 'attention');
  const resolved = items.map((i) => resolveContext(i, d)).filter((r): r is NonNullable<typeof r> => !!r);
  const steps = [resolved.length ? `Read ${resolved.length} item${resolved.length > 1 ? 's' : ''} you added` : 'Looked at the whole stack'];
  if (intent === 'lineage' || intent === 'cause' || intent === 'impact') steps.push('Walked the lineage across GTM, GA4, Google Ads and Meta');
  if (intent === 'cause' || intent === 'compare' || resolved.some((r) => r.item.kind === 'metric')) steps.push('Compared daily data with the previous period');
  if (intent === 'cause' || intent === 'changes') steps.push('Checked config changes from every platform');

  // Whole-stack intents ignore the selection unless it narrows things down.
  if (intent === 'attention' && !items.length) return { steps, ...attention(d) };
  if (intent === 'changes' && !items.length) return { steps, ...changes(d) };
  if (intent === 'summary') return { steps, ...summary(d, items) };
  if (!items.length) return { steps, ...general(d) };

  const parts: string[] = [];
  const actions: ChatAction[] = [];
  for (const item of items.slice(0, 4)) {
    const r = answerFor(intent, item, d);
    if (!r) continue;
    if (items.length > 1) parts.push(`### ${resolved.find((x) => x.key === contextKey(item))?.label ?? ''}`);
    parts.push(r.text);
    actions.push(...r.actions);
  }
  if (items.length > 4) parts.push(`_I looked at the first 4 of the ${items.length} items you added._`);
  return { steps, text: parts.join('\n\n') || "I couldn't find those items any more — they may have changed after a re-scan.", actions: dedupeActions(actions).slice(0, 4) };
}

function answerFor(intent: Intent, item: ContextItem, d: AssistantData): { text: string; actions: ChatAction[] } | null {
  switch (item.kind) {
    case 'problem': {
      const p = d.problems.find((x) => x.id === item.id);
      return p ? problemAnswer(intent, p, d) : null;
    }
    case 'entity': {
      const e = d.graph.byId.get(item.id);
      return e ? entityAnswer(intent, e, d) : null;
    }
    case 'metric': {
      const e = d.graph.byId.get(item.entityId);
      return e ? metricAnswer(intent, e, item.start, item.end, d) : null;
    }
    case 'conversion':
      return conversionAnswer(item.id, item.platform, d);
    case 'change':
      return changeAnswer(item.id, d);
  }
}

// ── Problems ───────────────────────────────────────────────────────────────────────────

function problemAnswer(intent: Intent, p: Problem, d: AssistantData) {
  const g = d.graph;
  const actions: ChatAction[] = [problemLink(p)];
  const expert = d.role === 'consultant';
  const lines: string[] = [];

  if (intent === 'fix') {
    if (p.fix) {
      lines.push(`**Recommended fix: ${p.fix.title}.** ${p.fix.rationale}`);
      if (p.fix.current.length) {
        lines.push('The change, ready for your review:');
        for (const o of p.fix.current.slice(0, 6)) {
          const e = g.byId.get(o.entityId);
          lines.push(`- ${e ? `${toolName(e.tool)} ${kindName(e)} **${e.name}**` : o.entityId}: \`${o.field}\` → \`${fmt(o.to, g.byId)}\``);
        }
        if (p.fix.current.length > 6) lines.push(`- …and ${p.fix.current.length - 6} more`);
      } else {
        lines.push('This one has to be done by hand in the platform:');
        p.fix.manualSteps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
      }
      if (p.fix.status === 'applied') lines.push('It has already been applied.');
      else if (canApplyDirectly(d.role, p.fix))
        lines.push(d.role === 'client' ? 'It is **low risk**, so you can apply it yourself from the problem page.' : `Risk: **${p.fix.risk}**. Review the diff, approve, then apply.`);
      else lines.push(`It is **${p.fix.risk} risk**, so it needs a consultant's approval. You can request a review from the problem page.`);
      if (p.fix.verifyAfter.length) lines.push(`After applying, check: ${p.fix.verifyAfter.join('; ')}.`);
      lines.push("_I can't change anything in your platforms myself — every change goes through your review._");
      actions.unshift({ label: p.fix.status === 'applied' ? 'View the applied fix' : 'Review the fix', to: `/problems/${encodeURIComponent(p.id)}#fix` });
    } else {
      lines.push(p.anomalies[0]?.recommendation ?? 'There is no automated fix for this one.');
    }
    return { text: lines.join('\n'), actions };
  }

  if (intent === 'impact') {
    lines.push(p.impact);
    for (const a of p.anomalies.slice(0, 3)) {
      const e = g.byId.get(a.entityId);
      const days = daysBetween(a.window.start, a.window.end) + 1;
      const missing = Math.max(0, (a.baseline - a.observed) * days);
      let value = '';
      const dv = Number((e?.config as Record<string, unknown>)?.defaultValue ?? 0);
      if (e?.kind === 'gads_conversion_action' && dv && missing) value = ` — roughly **$${n(missing * dv)}** of conversion value Google Ads didn't see`;
      if (a.changePct < 0) lines.push(`- **${e?.name}**: about ${n(a.baseline)} a day normally, ${n(a.observed)} a day since ${fmtShort(a.window.start)}. That's ~${n(missing)} missing over ${days} days${value}.`);
      else lines.push(`- **${e?.name}**: ${pct(a.changePct)} vs normal since ${fmtShort(a.window.start)}.`);
    }
    const downstream = new Set(p.entityIds.flatMap((id) => [...g.reachable(id, 'down')]));
    const campaigns = [...downstream].map((id) => g.byId.get(id)).filter((e): e is Entity => !!e && !p.entityIds.includes(e.id) && (e.kind === 'meta_campaign' || e.kind === 'gads_campaign'));
    if (campaigns.length) lines.push(`Campaigns that optimise for it: ${campaigns.map((e) => `**${e.name}**`).join(', ')} — their bidding is affected.`);
    return { text: lines.join('\n'), actions };
  }

  if (intent === 'cause') {
    const causes = p.anomalies.flatMap((a) => a.likelyCause.changeEventIds).filter((v, i, arr) => arr.indexOf(v) === i);
    const events = d.changeEvents.filter((c) => causes.includes(c.id));
    if (events.length) {
      lines.push('The most likely cause is a change made just before the break:');
      for (const c of events) lines.push(`- **${c.summary}** — ${toolName(c.tool)}, ${fmtShort(c.at)}, by ${c.actor}`);
      actions.push(...events.map((c) => ({ label: `Add "${trim(c.summary, 28)}"`, add: [{ kind: 'change', id: c.id } as ContextItem] })));
    }
    lines.push(p.issue?.diagnosis ?? p.anomalies[0]?.likelyCause.explanation ?? p.impact);
    return { text: lines.join('\n'), actions };
  }

  if (intent === 'lineage') {
    const primary = p.entityIds.map((id) => g.byId.get(id)).find((e) => e && e.tool !== 'site');
    if (primary) {
      const broken = new Set(p.issue?.linkIds ?? []);
      const brokenLinks = [...broken].map((id) => g.linkById.get(id)).filter(Boolean);
      lines.push(`Where **${primary.name}** gets its data from:`);
      pathStrings(g, primary.id, 'up', 3).forEach((s) => lines.push(`- ${s}`));
      if (brokenLinks.length)
        lines.push(`The broken step${brokenLinks.length > 1 ? 's are' : ' is'}: ${brokenLinks.map((l) => `**${g.byId.get(l!.from)?.name} → ${g.byId.get(l!.to)?.name}**`).join(', ')}.`);
      actions.push({ label: `Add "${trim(primary.name, 28)}"`, add: [{ kind: 'entity', id: primary.id }] });
    }
    return { text: lines.join('\n') || p.impact, actions };
  }

  // explain / config / compare default
  lines.push(`**${p.headline}** · ${SEVERITY_PLAIN[p.severity].label}`);
  lines.push(p.impact);
  if (expert && p.issue) {
    lines.push(`**Technical:** ${p.issue.ruleId} — ${p.technicalTitle}. ${p.issue.diagnosis}`);
    const ev = Object.entries(p.issue.evidence).slice(0, 5);
    if (ev.length) lines.push(ev.map(([k, v]) => `- ${k}: \`${String(v)}\``).join('\n'));
  } else if (p.issue && p.issue.diagnosis !== p.impact) {
    lines.push(`In more detail: ${p.issue.diagnosis}`);
  }
  if (p.fix && p.fix.status !== 'applied') lines.push(`There's a recommended fix ready: **${p.fix.title}**. Ask me "how do I fix it?" for the steps.`);
  return { text: lines.join('\n\n'), actions };
}

// ── Entities ───────────────────────────────────────────────────────────────────────────

function entityAnswer(intent: Intent, e: Entity, d: AssistantData) {
  const g = d.graph;
  const c = e.config as Record<string, any>;
  const problems = d.problems.filter((p) => p.entityIds.includes(e.id) && isActiveProblem(p));
  const actions: ChatAction[] = problems.slice(0, 2).map(problemLink);
  const lines: string[] = [];

  if (intent === 'lineage' || intent === 'impact') {
    const up = pathStrings(g, e.id, 'up', 3);
    const down = pathStrings(g, e.id, 'down', 3);
    const reach = [...g.reachable(e.id, 'down')].map((id) => g.byId.get(id)).filter((x): x is Entity => !!x);
    if (intent === 'lineage') {
      lines.push(up.length ? `**Where it comes from:**\n${up.map((s) => `- ${s}`).join('\n')}` : 'Nothing feeds this — it is where data enters the stack.');
      lines.push(down.length ? `**Where it goes:**\n${down.map((s) => `- ${s}`).join('\n')}` : 'Nothing downstream depends on it.');
    }
    if (reach.length) {
      const key = reach.filter((x) => ['gads_conversion_action', 'ga4_event', 'meta_event', 'gads_campaign', 'meta_campaign'].includes(x.kind));
      lines.push(`**If this breaks**, ${reach.length} thing${reach.length > 1 ? 's' : ''} downstream are affected${key.length ? `, including ${key.slice(0, 5).map((x) => `${toolName(x.tool)} **${x.name}**`).join(', ')}` : ''}.`);
    } else if (intent === 'impact') lines.push('Nothing downstream depends on it, so a break here has no knock-on effect.');
    return { text: lines.join('\n\n'), actions };
  }

  if (intent === 'cause' || intent === 'compare') {
    const series = metricSeries(e, d.metrics)[0];
    if (series) return metricAnswer(intent, e, d.metrics.dates[d.metrics.dates.length - 35], d.metrics.dates.at(-1)!, d);
  }

  if (intent === 'fix') {
    const withFix = problems.filter((p) => p.fix);
    if (!withFix.length) return { text: problems.length ? 'The problems here have no automated fix — see the problem page for the recommended action.' : `Nothing to fix on **${e.name}** — no open problems.`, actions };
    return { text: withFix.map((p) => problemAnswer('fix', p, d).text).join('\n\n'), actions };
  }

  lines.push(`**${e.name}** is a ${toolName(e.tool)} ${kindName(e)}${e.status !== 'active' ? ` (${e.status})` : ''}.`);
  const detail = describeEntity(e, c, g.byId);
  if (detail) lines.push(detail);
  const series = metricSeries(e, d.metrics)[0];
  if (series && series.values.some((v) => v > 0)) {
    const last7 = d.metrics.last(series.values, 7);
    const base = d.metrics.avg(series.values, 28, 7) * 7;
    lines.push(`Last 7 days: **${n(last7)}** ${series.name} (${base ? `${pct(last7 / base - 1)} vs a typical week` : 'no baseline'}).`);
  }
  if (problems.length) lines.push(`${problems.length === 1 ? 'There is 1 open problem' : `There are ${problems.length} open problems`}: ${problems.map((p) => `**${p.headline}**`).join('; ')}.`);
  else lines.push(intent === 'config' ? 'Its configuration passes all 23 checks.' : 'No open problems.');
  return { text: lines.join('\n\n'), actions };
}

function describeEntity(e: Entity, c: Record<string, any>, byId: Map<string, Entity>): string {
  switch (e.kind) {
    case 'gtm_tag':
      return `It fires on ${(c.firingTriggerIds as string[]).map((id) => `**${byId.get(id)?.name ?? 'a deleted trigger'}**`).join(', ') || 'no trigger'}${c.eventName ? ` and sends \`${c.eventName}\`` : ''}${c.consentRequired ? ` once \`${c.consentRequired}\` consent is given` : ''}.`;
    case 'gtm_trigger':
      return c.customEventName ? `It activates when the website pushes \`${c.customEventName}\` to the dataLayer.` : `Type: ${c.triggerType}${c.conditions ? ` (${c.conditions})` : ''}.`;
    case 'ga4_event':
      return `${n(c.eventCount28d)} events in the last 28 days. ${c.isKeyEvent ? 'It is a key event, so Google Ads can import it.' : 'It is **not** a key event, so Google Ads cannot import it.'}`;
    case 'gads_conversion_action':
      return `Source: ${c.source === 'WEBPAGE' ? 'Google Ads tag on the website' : c.source === 'UPLOAD_CLICKS' ? 'offline upload from the CRM' : 'imported from GA4'}. ${c.primaryForGoal ? 'Primary — bidding optimises for it.' : 'Secondary — reported but not used for bidding.'} Counts ${c.countingType === 'ONE_PER_CLICK' ? 'one' : 'every'} conversion per click, default value $${c.defaultValue}.`;
    case 'meta_event':
      return [c.receivesBrowser && 'Pixel', c.receivesServer && 'Conversions API'].filter(Boolean).join(' + ') + ' send it.' + (c.emq != null ? ` Event match quality ${c.emq}/10.` : '') + (c.dedupBrowserPct != null ? ` ${c.dedupBrowserPct}% of browser events are deduplicated with the server.` : '');
    case 'gads_campaign':
    case 'meta_campaign':
      return c.dailyBudget ? `Budget $${c.dailyBudget}/day.` : '';
    case 'datalayer_event':
      return c.description ?? '';
    default:
      return '';
  }
}

// ── Metrics ───────────────────────────────────────────────────────────────────────────

function metricAnswer(intent: Intent, e: Entity, start: string, end: string, d: AssistantData) {
  const m = d.metrics;
  const series = metricSeries(e, m);
  if (!series.length) return { text: `There's no daily data for **${e.name}**.`, actions: [] };
  const i0 = m.dates.indexOf(start);
  const i1 = m.dates.indexOf(end);
  const len = i1 - i0 + 1;
  const main = series.find((s) => s.name === 'conversions' || s.name === 'reported' || s.name === 'events') ?? series[0];
  const cur = main.values.slice(i0, i1 + 1);
  const prev = main.values.slice(Math.max(0, i0 - len), i0);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const lines: string[] = [];
  lines.push(`**${e.name}**, ${fmtShort(start)} – ${fmtShort(end)} (${len} days): ${n(avg(cur))} ${main.name} a day on average${prev.length ? `, vs ${n(avg(prev))} in the ${prev.length} days before (${avg(prev) ? pct(avg(cur) / avg(prev) - 1) : 'n/a'})` : ''}.`);

  // Biggest day-over-week step inside the range.
  let best = { i: -1, delta: 0 };
  for (let i = Math.max(i0, 7); i <= i1; i++) {
    const trailing = avg(main.values.slice(i - 7, i));
    const delta = trailing ? main.values[i] / trailing - 1 : 0;
    if (Math.abs(delta) > Math.abs(best.delta)) best = { i, delta };
  }
  const anomalies = d.problems.flatMap((p) => p.anomalies.map((a) => ({ a, p }))).filter(({ a }) => a.entityId === e.id && a.window.end >= start && a.window.start <= end);

  if (intent === 'cause' || intent === 'explain') {
    if (Math.abs(best.delta) >= 0.4) {
      const day = m.dates[best.i];
      lines.push(`The clearest break is on **${fmtShort(day)}** (${pct(best.delta)} vs the week before).`);
      const upstream = new Set([e.id, ...d.graph.reachable(e.id, 'up')]);
      const near = d.changeEvents.filter((c) => Math.abs(daysBetween(c.at, day)) <= 1 && (c.entityIds.some((id) => upstream.has(id)) || c.entityIds.length === 0));
      if (near.length) lines.push(`Changes on things that feed it around then:\n${near.map((c) => `- **${c.summary}** — ${toolName(c.tool)}, ${fmtShort(c.at)}, by ${c.actor}`).join('\n')}`);
      else lines.push('No config change on anything that feeds it was recorded around then, so look at spend, budgets or the website itself.');
    } else lines.push('There is no sharp break in this range — day-to-day movement is within normal variation.');
  }
  if (intent === 'compare') {
    const month = main.values.slice(Math.max(0, i0 - 28), i0);
    if (month.length) lines.push(`Against the 4 weeks before the range: ${n(avg(month))} a day (${avg(month) ? pct(avg(cur) / avg(month) - 1) : 'n/a'}).`);
    const others = series.filter((s) => s !== main);
    for (const s of others) {
      const a = avg(s.values.slice(i0, i1 + 1));
      const b = avg(s.values.slice(Math.max(0, i0 - len), i0));
      lines.push(`- ${s.name.replace('_', ' ')}: ${n(a)}/day vs ${n(b)}/day (${b ? pct(a / b - 1) : 'n/a'})`);
    }
  }
  if (anomalies.length) lines.push(`This overlaps a detected problem: ${anomalies.map(({ p }) => `**${p.headline}**`).join('; ')}.`);
  return { text: lines.join('\n\n'), actions: anomalies.slice(0, 2).map(({ p }) => problemLink(p)) };
}

// ── Conversions and changes ───────────────────────────────────────────────────────────

function conversionAnswer(id: string, platform: (typeof PLATFORMS)[number] | undefined, d: AssistantData) {
  const row = d.grid.find((r) => r.conversion.id === id);
  if (!row) return null;
  const names = { ga4: 'GA4', google_ads: 'Google Ads', meta: 'Meta' } as const;
  const lines = [`**${row.conversion.label}** — ${row.conversion.description.toLowerCase()}.`];
  const problems: Problem[] = [];
  for (const p of platform ? [platform] : PLATFORMS) {
    const c = row.cells[p];
    if (c.state === 'not_set_up') {
      lines.push(`- **${names[p]}**: not tracked.`);
      continue;
    }
    lines.push(`- **${names[p]}**: ${CELL_STATE[c.state].label.toLowerCase()} — ${n(c.last7)} in the last 7 days${c.changePct != null ? ` (${pct(c.changePct)} vs a typical week)` : ''}.${c.problems[0] ? ` Main problem: ${c.problems[0].headline}.` : ''}`);
    problems.push(...c.problems.slice(0, 1));
  }
  return { text: lines.join('\n'), actions: dedupeActions(problems.map(problemLink)) };
}

function changeAnswer(id: string, d: AssistantData) {
  const c = d.changeEvents.find((x) => x.id === id);
  if (!c) return null;
  const linked = d.problems.filter((p) => p.anomalies.some((a) => a.likelyCause.changeEventIds.includes(c.id)));
  const lines = [`**${c.summary}** — ${toolName(c.tool)}, ${fmtShort(c.at)}, by ${c.actor}.`];
  if (Array.isArray(c.after))
    lines.push((c.after as { entity: string; field: string; value: unknown }[]).map((a, i) => `- ${a.entity} · \`${a.field}\`: \`${String((c.before as { value: unknown }[])?.[i]?.value ?? '∅')}\` → \`${String(a.value ?? '∅')}\``).join('\n'));
  lines.push(linked.length ? `This change is the likely cause of: ${linked.map((p) => `**${p.headline}**`).join('; ')}.` : 'No problems have been traced back to this change.');
  return { text: lines.join('\n\n'), actions: linked.slice(0, 2).map(problemLink) };
}

// ── Whole-stack answers ───────────────────────────────────────────────────────────────

function attention(d: AssistantData) {
  const list = active(d);
  if (!list.length) return { text: 'Nothing needs attention — every conversion is tracking as expected.', actions: [] };
  const top = list.slice(0, 3);
  const lines = [`There ${list.length === 1 ? 'is 1 open problem' : `are ${list.length} open problems`}. Start with these:`];
  top.forEach((p, i) => lines.push(`${i + 1}. **${p.headline}** (${SEVERITY_PLAIN[p.severity].label.toLowerCase()}) — ${firstSentence(p.impact)}.`));
  const easy = list.filter((p) => p.fix && p.fix.status !== 'applied' && p.fix.risk === 'low').length;
  if (easy) lines.push(`${easy} of the open problems have low-risk fixes that can be applied in a click.`);
  return { text: lines.join('\n'), actions: top.map(problemLink) };
}

function changes(d: AssistantData) {
  const latest = d.metrics.dates.at(-1)!;
  const recent = d.changeEvents.filter((c) => daysBetween(c.at, latest) <= 14).sort((a, b) => b.at.localeCompare(a.at));
  if (!recent.length) return { text: 'No config changes in the last 14 days.', actions: [] };
  const lines = ['Config changes in the last 14 days:'];
  for (const c of recent.slice(0, 8)) {
    const linked = d.problems.filter((p) => p.anomalies.some((a) => a.likelyCause.changeEventIds.includes(c.id)));
    lines.push(`- **${fmtShort(c.at)}** · ${toolName(c.tool)} · ${c.summary} _(${c.actor})_${linked.length ? ` ⚠️ likely caused: ${linked.map((p) => p.headline).join('; ')}` : ''}`);
  }
  return { text: lines.join('\n'), actions: recent.slice(0, 2).map((c) => ({ label: `Add "${trim(c.summary, 28)}"`, add: [{ kind: 'change', id: c.id } as ContextItem] })) };
}

function summary(d: AssistantData, items: ContextItem[]) {
  const scoped = items.filter((i) => i.kind === 'problem').map((i) => d.problems.find((p) => p.id === (i as { id: string }).id)).filter((p): p is Problem => !!p);
  const list = scoped.length ? scoped : active(d);
  const urgent = list.filter((p) => p.severity === 'critical' || p.severity === 'high');
  const rest = list.filter((p) => !urgent.includes(p));
  const fixed = d.problems.filter((p) => p.status === 'fixed' || p.status === 'verifying');
  const lines = [
    'Here is a draft update you can send:',
    '',
    `> **Subject: Tracking health update — ${fmtShort(d.metrics.dates.at(-1)!)}**`,
    '>',
    `> Hi team, here's where conversion tracking stands after this morning's scan.`,
    '>',
  ];
  if (urgent.length) {
    lines.push(`> **Needs fixing now (${urgent.length})**`);
    urgent.forEach((p) => lines.push(`> - ${p.headline}. ${firstSentence(p.impact)}.`));
    lines.push('>');
  }
  if (rest.length) {
    lines.push(`> **Lower priority (${rest.length})**`);
    rest.slice(0, 5).forEach((p) => lines.push(`> - ${p.headline}`));
    lines.push('>');
  }
  if (fixed.length) {
    lines.push(`> **Fixed recently (${fixed.length})**`);
    fixed.slice(0, 5).forEach((p) => lines.push(`> - ${p.headline}${p.status === 'verifying' ? ' (confirming with new data)' : ''}`));
    lines.push('>');
  }
  lines.push(`> Next step: ${urgent[0]?.fix ? `apply "${urgent[0].fix.title}"` : 'review the open problems'} — I'll confirm once the next scan shows it working.`);
  return { text: lines.join('\n'), actions: [{ label: 'Open problems', to: '/problems' }] };
}

function general(d: AssistantData) {
  const a = attention(d);
  return {
    text: `${a.text}\n\nTip: select things on any screen — a problem, a tag, a conversion, or a date range on a chart — and add them here to ask about them specifically.`,
    actions: a.actions,
  };
}

// ── Suggested prompts ─────────────────────────────────────────────────────────────────

export function suggestions(items: ContextItem[], d: AssistantData): string[] {
  if (!items.length) return ['What needs my attention?', 'What changed recently?', 'Write a status update for the team'];
  const kinds = new Set(items.map((i) => i.kind));
  if (items.length > 1 && kinds.has('problem')) return ['Summarise these for a client update', 'Which should I fix first?', 'How do I fix these?'];
  const first = items[0];
  if (first.kind === 'problem') return ['Explain this in plain English', "What's the business impact?", 'How do I fix it?', 'Why did this happen?'];
  if (first.kind === 'metric') return ['Why did this change?', 'Compare with the previous period'];
  if (first.kind === 'change') return ['What did this change break?', 'Explain this change'];
  if (first.kind === 'conversion') return ['Is this tracking correctly?', 'Why is this broken?', 'How do I fix it?'];
  const e = d.graph.byId.get(first.id);
  return e && e.health !== 'healthy' ? ['Why is this broken?', 'How do I fix it?', 'What depends on this?'] : ['Explain this', 'What depends on this?', 'Is this set up correctly?'];
}

// ── helpers ───────────────────────────────────────────────────────────────────────────

function daysBetween(a: string, b: string) {
  return Math.round((new Date(`${b.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${a.slice(0, 10)}T00:00:00Z`).getTime()) / 86_400_000);
}

function fmt(v: unknown, byId: Map<string, Entity>): string {
  if (Array.isArray(v)) return v.map((x) => byId.get(String(x))?.name ?? String(x)).join(', ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return v === '' || v == null ? '(empty)' : String(v);
}

function dedupeActions(actions: ChatAction[]) {
  const seen = new Set<string>();
  return actions.filter((a) => (seen.has(a.label) ? false : (seen.add(a.label), true)));
}
