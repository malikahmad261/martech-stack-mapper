import '@xyflow/react/dist/style.css';
import { Background, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import clsx from 'clsx';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FLOW_LABELS } from '../../engine/graph';
import type { Health, Tool, ToolId } from '../../model/schema';
import { useEntityMap, useStore } from '../../store';
import { Card, HealthBadge, HealthDot, PageHeader, SeverityBadge } from '../components/common';
import { healthScore, isActiveAnomaly, isActiveIssue, scoreColor, toolEdges, toolHealth } from '../derive';
import { ANOMALY, HEALTH, TOOLS } from '../meta';

const POSITIONS: Record<ToolId, { x: number; y: number }> = {
  site: { x: 0, y: 190 },
  gtm_web: { x: 250, y: 190 },
  gtm_server: { x: 500, y: 340 },
  google_ads: { x: 760, y: 20 },
  ga4: { x: 760, y: 190 },
  meta: { x: 760, y: 360 },
};

interface ToolNodeData extends Record<string, unknown> {
  tool: Tool;
  health: Health;
  issues: number;
  anomalies: number;
  detail: string;
}

function ToolNode({ data }: NodeProps<Node<ToolNodeData>>) {
  const t = TOOLS[data.tool.id];
  return (
    <div className={clsx('w-52 cursor-pointer rounded-xl border-2 bg-white px-3.5 py-3 shadow-md transition hover:shadow-lg')} style={{ borderColor: HEALTH[data.health].stroke }}>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-slate-300" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-slate-300" />
      <Handle type="source" position={Position.Top} id="top" className="!h-2 !w-2 !border-0 !bg-slate-300" />
      <Handle type="target" position={Position.Bottom} id="bottom" className="!h-2 !w-2 !border-0 !bg-slate-300" />
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded" style={{ background: t.color }} />
        <span className="font-semibold text-slate-900">{data.tool.id === 'ga4' ? 'GA4' : t.label}</span>
        <HealthDot health={data.health} className="ml-auto" />
      </div>
      <div className="mt-0.5 font-mono text-[11px] text-slate-500">{data.tool.externalId}</div>
      <div className="mt-1 text-[11px] text-slate-500">{data.detail}</div>
      <div className="mt-2 flex gap-1.5 text-[11px]">
        <span className={clsx('rounded px-1.5 py-0.5', data.issues ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-400')}>{data.issues} issues</span>
        <span className={clsx('rounded px-1.5 py-0.5', data.anomalies ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-400')}>{data.anomalies} anomalies</span>
      </div>
    </div>
  );
}

const nodeTypes = { tool: ToolNode };

function edgeLabel(byType: Record<string, number>) {
  return Object.entries(byType)
    .map(([type, n]) => `${n} ${FLOW_LABELS[type as keyof typeof FLOW_LABELS]}`)
    .join(' · ');
}

export function StackMap() {
  const navigate = useNavigate();
  const tools = useStore((s) => s.tools);
  const entities = useStore((s) => s.entities);
  const links = useStore((s) => s.links);
  const issues = useStore((s) => s.issues);
  const anomalies = useStore((s) => s.anomalies);
  const fixes = useStore((s) => s.fixes);
  const byId = useEntityMap();

  const edges = useMemo(() => toolEdges(entities, links), [entities, links]);
  const activeIssues = issues.filter(isActiveIssue);
  const activeAnoms = anomalies.filter(isActiveAnomaly);

  const nodes: Node<ToolNodeData>[] = tools.map((t) => {
    const ents = entities.filter((e) => e.tool === t.id);
    const s = t.settings as Record<string, any>;
    const detail =
      t.id === 'site'
        ? `${ents.filter((e) => e.kind === 'datalayer_event').length} dataLayer events`
        : t.id.startsWith('gtm')
          ? `v${s.liveVersion} · ${ents.filter((e) => e.kind === 'gtm_tag').length} tags`
          : t.id === 'ga4'
            ? `${s.measurementId} · ${ents.filter((e) => e.kind === 'ga4_event' && e.config.isKeyEvent).length} key events`
            : t.id === 'google_ads'
              ? `${ents.filter((e) => e.kind === 'gads_conversion_action').length} conversion actions · ${ents.filter((e) => e.kind === 'gads_campaign').length} campaigns`
              : `Dataset ${s.datasetId} · ${ents.filter((e) => e.kind === 'meta_campaign').length} campaigns`;
    return {
      id: t.id,
      type: 'tool',
      position: POSITIONS[t.id],
      data: {
        tool: t,
        health: toolHealth(t.id, entities),
        issues: activeIssues.filter((i) => i.entityIds.some((id) => byId.get(id)?.tool === t.id)).length,
        anomalies: activeAnoms.filter((a) => byId.get(a.entityId)?.tool === t.id).length,
        detail,
      },
    };
  });

  const flowEdges: Edge[] = edges.map((e) => {
    const vertical = e.from === 'ga4' && e.to === 'google_ads';
    const color = HEALTH[e.health].stroke;
    return {
      id: `${e.from}>${e.to}`,
      source: e.from,
      target: e.to,
      ...(vertical ? { sourceHandle: 'top', targetHandle: 'bottom' } : {}),
      type: 'default',
      animated: e.health === 'healthy',
      label: `${e.links.length} link${e.links.length > 1 ? 's' : ''}`,
      labelStyle: { fontSize: 10, fill: '#475569' },
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.92 },
      labelBgPadding: [4, 2] as [number, number],
      style: { stroke: color, strokeWidth: e.health === 'healthy' ? 1.8 : 2.6, cursor: 'pointer' },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
    };
  });

  const score = healthScore(issues);
  const bySeverity = (['critical', 'high', 'medium', 'low'] as const).map((s) => ({ s, n: activeIssues.filter((i) => i.severity === s).length }));
  const pendingFixes = fixes.filter((f) => ['draft', 'edited', 'approved'].includes(f.status) && f.issueIds.some((id) => activeIssues.some((i) => i.id === id)));

  return (
    <div>
      <PageHeader
        title="Stack map"
        subtitle="How data moves through BrightPath Solar's martech stack. Each line summarises the individual links between two tools and is coloured by the worst health among them. Click a tool to see its entities and lineage, or a line to see the links behind it."
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="overflow-hidden">
          <div className="h-[380px] sm:h-[560px]">
            <ReactFlow
              nodes={nodes}
              edges={flowEdges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.12 }}
              minZoom={0.2}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              zoomOnScroll={false}
              panOnScroll={false}
              preventScrolling={false}
              proOptions={{ hideAttribution: true }}
              onNodeClick={(_, n) => navigate(`/tools/${n.id}`)}
              onEdgeClick={(_, e) => {
                const [from, to] = e.id.split('>');
                navigate(`/relationships?from=${from}&to=${to}`);
              }}
            >
              <Background color="#e2e8f0" gap={20} />
            </ReactFlow>
          </div>
          <div className="flex flex-wrap gap-4 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
            {(['healthy', 'degraded', 'broken', 'inactive'] as const).map((h) => (
              <span key={h} className="flex items-center gap-1.5">
                <span className="h-0.5 w-5 rounded" style={{ background: HEALTH[h].stroke }} />
                {HEALTH[h].label}
              </span>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Stack health</div>
            <div className={clsx('mt-1 text-4xl font-semibold tabular-nums', scoreColor(score))}>{score}</div>
            <p className="mt-1 text-xs text-slate-500">100 minus weighted open issues (critical 8, high 5, medium 2, low 1).</p>
          </Card>
          <Card title="Open issues" actions={<Link to="/issues" className="text-xs font-medium text-indigo-600 hover:underline">View all</Link>}>
            <div className="grid grid-cols-2 gap-2 p-4">
              {bySeverity.map(({ s, n }) => (
                <Link key={s} to="/issues" className="rounded-lg border border-slate-100 p-2.5 hover:border-slate-300">
                  <div className="text-xl font-semibold tabular-nums">{n}</div>
                  <SeverityBadge severity={s} />
                </Link>
              ))}
            </div>
          </Card>
          <Card title="Active anomalies" actions={<Link to="/anomalies" className="text-xs font-medium text-indigo-600 hover:underline">View all</Link>}>
            <ul className="divide-y divide-slate-100">
              {(['tracking_outage', 'bot_traffic', 'spend_driven'] as const).map((t) => (
                <li key={t}>
                  <Link to={`/anomalies?type=${t}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-slate-50">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: ANOMALY[t].color }} />
                      {ANOMALY[t].label}
                    </span>
                    <span className="font-semibold tabular-nums">{activeAnoms.filter((a) => a.type === t).length}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Fixes awaiting review</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{pendingFixes.length}</div>
              </div>
              <Link to="/fixes" className="text-xs font-medium text-indigo-600 hover:underline">
                Open queue
              </Link>
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-5" title="Connections">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">From</th>
                <th className="px-4 py-2 font-medium">To</th>
                <th className="px-4 py-2 font-medium">Links</th>
                <th className="px-4 py-2 font-medium">Health</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {edges.map((e) => (
                <tr key={`${e.from}>${e.to}`} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium">{TOOLS[e.from].label}</td>
                  <td className="px-4 py-2 font-medium">{TOOLS[e.to].label}</td>
                  <td className="px-4 py-2 text-slate-600">{edgeLabel(e.byType)}</td>
                  <td className="px-4 py-2">
                    <HealthBadge health={e.health} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link to={`/relationships?from=${e.from}&to=${e.to}`} className="text-xs font-medium text-indigo-600 hover:underline">
                      View {e.links.length} links
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
