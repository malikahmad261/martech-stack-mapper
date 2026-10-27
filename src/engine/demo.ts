import { loadSources, type SourceData } from '../connectors';
import { LATEST_SCAN_AT } from '../connectors/demo/timeline';
import type { Scan } from '../model/schema';
import { runScan, type ScanResult } from './scan';

// Builds the starting state: the latest scheduled scan, plus 30 days of scan history whose
// summaries line up with the change events and when each seeded issue first appeared.

const FIRST_SEEN: Record<string, string> = {
  'CT-01': '2026-10-07',
  'CT-07': '2026-10-12',
  'CT-02': '2026-10-21',
};
const HISTORY_START = '2026-09-28';

export const scanIdFor = (iso: string, trigger: Scan['trigger'] = 'scheduled') =>
  `scan-${iso.slice(0, 10)}${trigger === 'scheduled' ? '' : `-${iso.slice(11, 16).replace(':', '')}`}`;

export interface DemoState extends ScanResult {
  source: SourceData;
  scans: Scan[];
}

export function buildDemoState(): DemoState {
  const latestId = scanIdFor(LATEST_SCAN_AT);
  const source = loadSources(latestId);
  const result = runScan({
    scanId: latestId,
    at: LATEST_SCAN_AT,
    trigger: 'scheduled',
    baseEntities: source.entities,
    tools: source.tools,
    metrics: source.metrics,
    changeEvents: source.changeEvents,
    prevIssues: [],
    prevFixes: [],
    prevAnomalies: [],
    firstSeen: (rule) => scanIdFor(`${FIRST_SEEN[rule.id] ?? HISTORY_START}T06:00:00Z`),
  });

  // History: one scheduled scan a day, plus change-detected scans after GTM publishes.
  const scans: Scan[] = [];
  const start = new Date(`${HISTORY_START}T06:00:00Z`);
  const end = new Date(LATEST_SCAN_AT);
  const changeScans = source.changeEvents
    .filter((c) => c.kind === 'gtm_publish' && c.at >= start.toISOString())
    .map((c) => new Date(new Date(c.at).getTime() + 47 * 60_000).toISOString());
  const times: { at: string; trigger: Scan['trigger'] }[] = changeScans.map((at) => ({ at, trigger: 'change_detected' }));
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) times.push({ at: d.toISOString(), trigger: 'scheduled' });
  times.sort((a, b) => a.at.localeCompare(b.at));

  let prevAt = new Date(start.getTime() - 86_400_000).toISOString();
  for (const t of times) {
    const id = scanIdFor(t.at, t.trigger);
    const configChanges = source.changeEvents.filter((c) => c.at > prevAt && c.at <= t.at).length;
    const newIssues = result.issues.filter((i) => i.firstDetectedScanId === id).length;
    scans.push({
      id,
      trigger: t.trigger,
      startedAt: t.at,
      finishedAt: new Date(new Date(t.at).getTime() + (t.trigger === 'scheduled' ? 41_000 : 12_000)).toISOString(),
      sources: (['gtm_web', 'gtm_server', 'ga4', 'google_ads', 'meta'] as const)
        .filter((s) => t.trigger === 'scheduled' || s.startsWith('gtm'))
        .map((s) => ({ source: s, status: 'ok' as const, snapshotId: `${id}:${s}` })),
      summary: { newIssues, resolvedIssues: 0, configChanges },
    });
    prevAt = t.at;
  }
  // The latest scheduled scan is the one we actually ran.
  scans[scans.length - 1] = { ...result.scan, summary: { ...scans[scans.length - 1].summary } };

  return { ...result, source, scans: scans.reverse() };
}
