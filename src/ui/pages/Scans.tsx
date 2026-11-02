import clsx from 'clsx';
import { CalendarClock, Plug, Zap } from 'lucide-react';
import type { SourceId } from '../../model/schema';
import { SNAPSHOTS, useStore } from '../../store';
import { Badge, Card, PageHeader } from '../components/common';
import { TOOLS, fmtDateTime } from '../meta';
import { ChangeHistory } from './ToolPage';

const PHASE2: Record<SourceId, { api: string; auth: string; changes: string; note: string }> = {
  gtm_web: {
    api: 'Tag Manager API v2 — live container version',
    auth: 'Google OAuth · tagmanager.readonly (+ edit/publish scopes to apply fixes)',
    changes: 'Hourly check of the latest version header',
    note: 'No approval needed.',
  },
  gtm_server: {
    api: 'Tag Manager API v2 — server container incl. clients',
    auth: 'Google OAuth · same as GTM Web',
    changes: 'Hourly check of the latest version header',
    note: 'No approval needed.',
  },
  ga4: {
    api: 'Analytics Admin API (config) + Data API (daily aggregates)',
    auth: 'Google OAuth · analytics.readonly (analytics.edit to apply fixes)',
    changes: 'searchChangeHistoryEvents',
    note: 'No approval needed. Some Admin resources are still alpha.',
  },
  google_ads: {
    api: 'Google Ads API (GAQL): customer, conversion_action, campaign metrics',
    auth: 'Google OAuth + developer token (Explorer access is enough for one account)',
    changes: 'change_event resource (last 30 days)',
    note: 'Apply for the developer token early — reviews have been slow in 2026.',
  },
  meta: {
    api: 'Marketing API (Insights, campaigns) + Dataset Quality API',
    auth: 'System user token · ads_read, business_management',
    changes: 'Ad account activities edge',
    note: 'Most Pixel/dataset settings can only be changed in Events Manager — fixes there stay manual.',
  },
};

const TRIGGER: Record<string, { label: string; cls: string; icon: typeof Zap }> = {
  scheduled: { label: 'Scheduled', cls: 'bg-slate-100 text-slate-600 ring-slate-200', icon: CalendarClock },
  on_demand: { label: 'On demand', cls: 'bg-indigo-50 text-indigo-700 ring-indigo-200', icon: Zap },
  change_detected: { label: 'Change detected', cls: 'bg-amber-50 text-amber-800 ring-amber-200', icon: Zap },
};

export function Scans() {
  const scans = useStore((s) => s.scans);
  const entities = useStore((s) => s.entities);
  const tools = useStore((s) => s.tools);
  const changeEvents = useStore((s) => s.changeEvents);
  const latest = scans[0];

  return (
    <div>
      <PageHeader
        eyebrow="Monitoring"
        title="Scans & history"
        subtitle="A full scan runs every day at 06:00 UTC. An hourly lightweight check looks for config changes (such as a GTM publish) and re-scans that source straight away. You can also re-scan at any time."
      />
      <Card className="mb-8" title="Change history" subtitle="Every config change across the stack: GTM publishes, GA4 and Google Ads settings, Meta activity, and fixes applied here. Newest first.">
        <div className="max-h-[480px] overflow-y-auto">
          <ChangeHistory events={[...changeEvents].sort((a, b) => a.at.localeCompare(b.at))} />
        </div>
      </Card>

      <h2 className="mb-3 font-display text-[17px] font-semibold tracking-tight text-slate-900">Sources</h2>
      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(['gtm_web', 'gtm_server', 'ga4', 'google_ads', 'meta'] as SourceId[]).map((s) => {
          const t = tools.find((x) => x.id === s)!;
          const snap = SNAPSHOTS.find((x) => x.source === s)!;
          const count = entities.filter((e) => e.tool === s).length;
          const p = PHASE2[s];
          return (
            <Card key={s} className="flex flex-col overflow-hidden">
              <div className="flex items-start justify-between gap-2 px-5 pt-4">
                <div>
                  <div className="flex items-center gap-2 font-display font-semibold tracking-tight text-slate-900">
                    <span className="h-3 w-3 rounded" style={{ background: TOOLS[s].color }} />
                    {TOOLS[s].label}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-slate-500">{t.externalId}</div>
                </div>
                <Badge className="bg-amber-50 text-amber-800 ring-amber-200">Demo data</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 px-5 py-3 text-xs">
                <div>
                  <div className="text-slate-500">Last sync</div>
                  <div className="font-medium text-slate-800">{latest ? fmtDateTime(latest.startedAt) : '—'}</div>
                </div>
                <div>
                  <div className="text-slate-500">Entities</div>
                  <div className="font-medium text-slate-800">{count}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-slate-500">Raw format</div>
                  <div className="font-mono text-slate-800">{snap.format}</div>
                </div>
              </div>
              <div className="mt-auto space-y-1 border-t border-slate-900/[.06] bg-white/40 px-5 py-3 text-xs text-slate-600">
                <div className="mb-1 flex items-center gap-1 font-semibold text-slate-700">
                  <Plug size={12} /> Phase 2 live connection
                </div>
                <div>{p.api}</div>
                <div>{p.auth}</div>
                <div>Change detection: {p.changes}</div>
                <div className="text-slate-500">{p.note}</div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card title="Scan history">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr className="border-b border-slate-900/[.06]">
                <th className="px-5 py-2.5 font-medium">Started</th>
                <th className="px-4 py-2 font-medium">Trigger</th>
                <th className="px-4 py-2 font-medium">Sources</th>
                <th className="px-4 py-2 font-medium">Duration</th>
                <th className="px-4 py-2 text-right font-medium">New issues</th>
                <th className="px-4 py-2 text-right font-medium">Resolved</th>
                <th className="px-4 py-2 text-right font-medium">Config changes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/[.06]">
              {scans.map((s) => {
                const tr = TRIGGER[s.trigger];
                const Icon = tr.icon;
                return (
                  <tr key={s.id}>
                    <td className="whitespace-nowrap px-5 py-2.5">{fmtDateTime(s.startedAt)}</td>
                    <td className="px-4 py-2">
                      <Badge className={tr.cls}>
                        <Icon size={11} />
                        {tr.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        {s.sources.map((x) => (
                          <span key={x.source} title={TOOLS[x.source].label} className="h-2.5 w-2.5 rounded-sm" style={{ background: TOOLS[x.source].color }} />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 tabular-nums text-slate-500">{Math.round((new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()) / 1000)}s</td>
                    <td className={clsx('px-4 py-2 text-right tabular-nums', s.summary.newIssues ? 'font-semibold text-rose-600' : 'text-slate-400')}>{s.summary.newIssues}</td>
                    <td className={clsx('px-4 py-2 text-right tabular-nums', s.summary.resolvedIssues ? 'font-semibold text-emerald-600' : 'text-slate-400')}>{s.summary.resolvedIssues}</td>
                    <td className={clsx('px-4 py-2 text-right tabular-nums', s.summary.configChanges ? 'font-semibold text-slate-800' : 'text-slate-400')}>{s.summary.configChanges}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
