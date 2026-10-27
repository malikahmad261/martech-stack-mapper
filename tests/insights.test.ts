import { describe, expect, it } from 'vitest';
import { resolveContext, type AssistantData, type ContextItem } from '../src/assistant/context';
import { detectIntent, respond, suggestions } from '../src/assistant/respond';
import { buildDemoState } from '../src/engine/demo';
import { Graph } from '../src/engine/graph';
import { MetricIndex } from '../src/engine/metrics';
import * as wf from '../src/engine/workflow';
import { buildConversionGrid } from '../src/insights/conversions';
import { buildProblems, canApplyDirectly, isActiveProblem, problemIdFor } from '../src/insights/problems';

const demo = buildDemoState();
const metrics = new MetricIndex(demo.source.metrics);

function appData(): wf.AppData {
  return {
    baseEntities: demo.source.entities,
    tools: demo.tools,
    entities: demo.entities,
    links: demo.links,
    issues: demo.issues,
    fixes: demo.fixes,
    anomalies: demo.anomalies,
    scans: demo.scans,
    changeEvents: demo.source.changeEvents,
    ruleResults: demo.ruleResults,
  };
}

function assistantData(d: wf.AppData, role: 'client' | 'consultant' = 'client'): AssistantData {
  const graph = new Graph(d.entities, d.links);
  const problems = buildProblems(d);
  return { graph, problems, metrics, changeEvents: d.changeEvents, grid: buildConversionGrid(graph, metrics, problems), tools: d.tools, role };
}

const cell = (d: AssistantData, conversion: string, platform: 'ga4' | 'google_ads' | 'meta') => d.grid.find((r) => r.conversion.id === conversion)!.cells[platform];

describe('problems', () => {
  const problems = buildProblems(demo);

  it('folds anomalies into the issue that caused them', () => {
    const quote = problems.find((p) => p.id === 'CT-02:gtm_web:trigger:3')!;
    expect(quote.anomalies).toHaveLength(4);
    // An anomaly explained by an issue never appears on its own.
    const standalone = problems.filter((p) => p.source === 'anomaly').flatMap((p) => p.anomalies);
    expect(standalone.every((a) => a.likelyCause.issueIds.length === 0)).toBe(true);
    expect(problems).toHaveLength(demo.issues.length + standalone.length);
  });

  it('marks spend-driven changes as information, not problems', () => {
    const fyi = problems.filter((p) => p.fyi);
    expect(fyi.length).toBe(2);
    expect(fyi.every((p) => p.anomalies[0].type === 'spend_driven')).toBe(true);
  });

  it('gives every seeded issue a plain-language headline', () => {
    for (const p of problems.filter((x) => x.source === 'issue')) {
      expect(p.headline).not.toBe(p.technicalTitle);
      expect(p.headline).not.toMatch(/event_id|CAPI|ad_user_data/);
    }
  });

  it('finds the problem for an old issue, anomaly or fix link', () => {
    expect(problemIdFor(problems, { fixId: 'MT-01:gtm_web:tag:12:fix' })).toBe('MT-01:gtm_web:tag:12');
    expect(problemIdFor(problems, { anomalyId: 'tracking_outage:meta:event:Lead:2026-10-18' })).toBe('CT-02:gtm_web:trigger:3');
  });

  it('lets clients apply low-risk fixes only', () => {
    const fixes = new Map(demo.fixes.map((f) => [f.id, f]));
    expect(canApplyDirectly('client', fixes.get('MT-01:gtm_web:tag:12:fix')!)).toBe(true);
    expect(canApplyDirectly('client', fixes.get('CT-02:gtm_web:trigger:3:fix')!)).toBe(false);
    expect(canApplyDirectly('consultant', fixes.get('CT-02:gtm_web:trigger:3:fix')!)).toBe(true);
  });

  it('tracks a client review request through to approval', () => {
    const fixId = 'CT-02:gtm_web:trigger:3:fix';
    let d = wf.requestReview(appData(), fixId, '2026-10-27T09:00:00Z', 'Jamie (BrightPath Solar)', 'check regex');
    expect(buildProblems(d).find((p) => p.fix?.id === fixId)!.status).toBe('review_requested');
    d = wf.setFixStatus(d, fixId, 'approved', '2026-10-27T10:00:00Z', 'Sam (Agency) (via Stack Mapper)');
    expect(buildProblems(d).find((p) => p.fix?.id === fixId)!.status).toBe('approved');
    expect(d.fixes.find((f) => f.id === fixId)!.history.map((h) => h.by)).toContain('Jamie (BrightPath Solar)');
  });
});

describe('conversion grid', () => {
  it('shows where each conversion is broken', () => {
    const d = assistantData(appData());
    expect(['ga4', 'google_ads', 'meta'].map((p) => cell(d, 'quote', p as never).state)).toEqual(['broken', 'broken', 'broken']);
    // GA4 still records consultations; only the Google Ads import is broken.
    expect(cell(d, 'consult', 'ga4').state).toBe('attention');
    expect(cell(d, 'consult', 'google_ads').state).toBe('broken');
    expect(cell(d, 'newsletter', 'google_ads').state).toBe('not_set_up');
    expect(cell(d, 'quote', 'google_ads').entities.map((e) => e.name)).toEqual(['Quote Request', 'generate_lead (GA4)']);
  });

  it('shows a fixed conversion as confirming until new data arrives', () => {
    const fixId = 'CT-01:google_ads:conversion_action:3:fix';
    const at = '2026-10-27T09:00:00Z';
    const d = wf.applyFix(wf.setFixStatus(appData(), fixId, 'approved', at), demo.source.metrics, fixId, at);
    expect(cell(assistantData(d), 'consult', 'google_ads').state).toBe('verifying');
  });
});

describe('assistant', () => {
  const d = assistantData(appData());
  const ct02: ContextItem = { kind: 'problem', id: 'CT-02:gtm_web:trigger:3' };

  it('recognises common questions', () => {
    expect(detectIntent('How do I fix it?')).toBe('fix');
    expect(detectIntent('Why did this change?')).toBe('cause');
    expect(detectIntent("What's the business impact?")).toBe('impact');
    expect(detectIntent('What depends on this?')).toBe('lineage');
    expect(detectIntent('What needs my attention?')).toBe('attention');
    expect(detectIntent('Write a status update for the team')).toBe('summary');
  });

  it('resolves every kind of context to a payload', () => {
    const items: ContextItem[] = [
      ct02,
      { kind: 'entity', id: 'gtm_web:trigger:3' },
      { kind: 'metric', entityId: 'google_ads:conversion_action:1', start: '2026-10-10', end: '2026-10-26' },
      { kind: 'conversion', id: 'quote' },
      { kind: 'change', id: 'gtm_web:version:47' },
    ];
    for (const i of items) expect(resolveContext(i, d)?.payload).toBeTruthy();
    const metric = resolveContext(items[2], d)!.payload as { rows: unknown[] };
    expect(metric.rows).toHaveLength(17);
  });

  it('traces a drop back to the change that caused it', () => {
    const r = respond('Why did this change?', [{ kind: 'metric', entityId: 'google_ads:conversion_action:1', start: '2026-10-10', end: '2026-10-26' }], d);
    expect(r.text).toContain('Oct 18');
    expect(r.text).toContain('v47');
  });

  it('respects who can apply a fix and never applies it itself', () => {
    const client = respond('How do I fix it?', [ct02], d);
    expect(client.text).toContain("consultant's approval");
    const consultant = respond('How do I fix it?', [ct02], assistantData(appData(), 'consultant'));
    expect(consultant.text).toContain('approve, then apply');
    // Actions only navigate or add context.
    for (const a of [...client.actions, ...consultant.actions]) expect(Object.keys(a).every((k) => ['label', 'to', 'add'].includes(k))).toBe(true);
  });

  it('answers whole-stack questions without context', () => {
    const r = respond('What needs my attention?', [], d);
    expect(r.text).toMatch(/open problems/);
    expect(r.actions.length).toBeGreaterThan(0);
    expect(suggestions([], d)).toContain('What needs my attention?');
  });

  it('only counts active problems in the attention list', () => {
    const active = d.problems.filter((p) => isActiveProblem(p) && !p.fyi).length;
    expect(respond('What needs my attention?', [], d).text).toContain(`${active} open problems`);
  });
});
