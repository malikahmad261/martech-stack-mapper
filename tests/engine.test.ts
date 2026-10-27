import { describe, expect, it } from 'vitest';
import { buildDemoState } from '../src/engine/demo';
import { validateOperations } from '../src/engine/fixes';
import { Graph } from '../src/engine/graph';
import { applyFix, rescan, setFixStatus, updateFix, type AppData } from '../src/engine/workflow';

const demo = buildDemoState();
const metrics = demo.source.metrics;
const initial: AppData = {
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
const AT = '2026-10-27T09:00:00Z';
const issue = (d: AppData, id: string) => d.issues.find((i) => i.id === id)!;
const names = (g: Graph, ids: string[]) => ids.map((id) => g.byId.get(id)!.name);

function approveAndApply(d: AppData, fixId: string) {
  return applyFix(setFixStatus(d, fixId, 'approved', AT), metrics, fixId, AT);
}

describe('lineage', () => {
  const g = new Graph(demo.entities, demo.links);

  it('traces Meta Lead back through both the Pixel and the CAPI path', () => {
    const paths = g.lineage('meta:event:Lead', 'up').map((p) => names(g, p.steps.map((s) => s.entityId)));
    expect(paths).toContainEqual(['quote_submitted', 'CE – quote_submit', 'Meta – Lead', 'Lead']);
    expect(paths).toContainEqual(['quote_submitted', 'CE – quote_submit', 'GA4 – generate_lead', 'GA4', 'GA4 – generate_lead', 'Meta CAPI – Lead', 'Lead']);
  });

  it('is event-aware through the server client', () => {
    const up = [...g.reachable('gtm_server:tag:2', 'up')].map((id) => g.byId.get(id)!.name);
    expect(up).toContain('GA4 – generate_lead');
    expect(up).not.toContain('GA4 – sign_up');
    expect(up).not.toContain('Google tag – G-BP12XYZ9QK');
  });

  it('connects GA4 key events to their Google Ads imports and campaigns', () => {
    const down = [...g.reachable('ga4:event:generate_lead', 'down')];
    expect(down).toContain('google_ads:conversion_action:2');
    expect(down).toContain('google_ads:campaign:20001');
  });
});

describe('rules', () => {
  it('finds exactly the seeded issues', () => {
    expect(demo.issues.map((i) => i.ruleId).sort()).toEqual(
      ['CF-04', 'CF-06', 'CK-01', 'CK-03', 'CN-01', 'CN-02', 'CT-01', 'CT-02', 'CT-03', 'CT-04', 'CT-07', 'DQ-01', 'MT-01', 'MT-02'].sort(),
    );
    expect(demo.ruleResults.filter((r) => r.passed)).toHaveLength(9);
  });

  it('attributes CT-02 to the GTM v47 trigger change', () => {
    const i = issue(initial, 'CT-02:gtm_web:trigger:3');
    expect(String(i.evidence['Related change'])).toContain('v47');
  });
});

describe('anomalies', () => {
  const byType = (t: string) => demo.anomalies.filter((a) => a.type === t);

  it('classifies the three anomaly types separately', () => {
    expect(byType('spend_driven').map((a) => a.entityId).sort()).toEqual(['google_ads:campaign:20001', 'meta:campaign:120210000000002']);
    expect(byType('bot_traffic').map((a) => a.entityId)).toEqual(['meta:campaign:120210000000001']);
    expect(byType('tracking_outage').length).toBeGreaterThanOrEqual(6);
  });

  it('attributes the quote outage to GTM v47 through upstream lineage', () => {
    const a = demo.anomalies.find((x) => x.type === 'tracking_outage' && x.entityId === 'google_ads:conversion_action:1')!;
    expect(a.window.start).toBe('2026-10-18');
    expect(a.likelyCause.changeEventIds).toContain('gtm_web:version:47');
  });

  it('attributes the Consultation Booked outage to the GA4 key event removal', () => {
    const a = demo.anomalies.find((x) => x.type === 'tracking_outage' && x.entityId === 'google_ads:conversion_action:3')!;
    expect(a.likelyCause.changeEventIds).toContain('ga4:change:ch-20261006-1');
  });

  it('merges a Meta event whose browser and server copies broke together', () => {
    const lead = demo.anomalies.filter((x) => x.entityId === 'meta:event:Lead');
    expect(lead).toHaveLength(1);
    expect(lead[0].metric).toBe('events');
  });
});

describe('fix workflow', () => {
  it('applying MT-01 resolves it, re-links dedup, and marks DQ-01 as pending data', () => {
    const fixId = issue(initial, 'MT-01:gtm_web:tag:12').fixId!;
    const d = approveAndApply(initial, fixId);
    expect(issue(d, 'MT-01:gtm_web:tag:12').status).toBe('resolved');
    expect(issue(d, 'DQ-01:meta:event:Lead')).toMatchObject({ status: 'resolved', verification: 'pending_data' });
    expect(d.links.find((l) => l.type === 'deduplicates_with' && l.from === 'gtm_web:tag:12')!.health).toBe('healthy');
    const container = d.baseEntities.find((e) => e.id === 'gtm_web:container:GTM-BPW7K2Q')!;
    expect(container.config.liveVersion).toBe(48);
    expect(d.changeEvents.at(-1)!.summary).toContain('v48');
  });

  it('re-scan credits resolutions to the new scan', () => {
    const fixId = issue(initial, 'CK-01:gtm_web:tag:7').fixId!;
    const d = rescan(approveAndApply(initial, fixId), metrics, '2026-10-27T10:00:00Z');
    expect(d.scans[0].summary.resolvedIssues).toBe(1);
    expect(d.scans[0].summary.configChanges).toBe(1);
  });

  it('an edited fix that no longer solves the problem reopens the issue with a new fix', () => {
    const fixId = issue(initial, 'CT-03:google_ads:conversion_action:4').fixId!;
    const fix = initial.fixes.find((f) => f.id === fixId)!;
    const edited = updateFix(initial, fixId, { current: fix.current.map((o) => ({ ...o, to: 'MANY_PER_CLICK' })) }, AT);
    const d = approveAndApply(edited, fixId);
    const i = issue(d, 'CT-03:google_ads:conversion_action:4');
    expect(i.status).toBe('open');
    expect(i.fixId).not.toBe(fixId);
  });

  it('validation rejects references to variables that do not exist', () => {
    const fixId = issue(initial, 'MT-01:gtm_web:tag:12').fixId!;
    const fix = initial.fixes.find((f) => f.id === fixId)!;
    const ops = fix.current.map((o) => ({ ...o, to: '{{DLV – evnt_id}}' }));
    expect(Object.values(validateOperations(initial.baseEntities, ops).errors)[0]).toMatch(/doesn't exist/);
    expect(() => setFixStatus(updateFix(initial, fixId, { current: ops }, AT), fixId, 'approved', AT)).toThrow();
  });
});
