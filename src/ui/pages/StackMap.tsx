import '@xyflow/react/dist/style.css';
import { Background, BaseEdge, EdgeLabelRenderer, getBezierPath, Handle, MarkerType, Position, ReactFlow, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FLOW_LABELS } from '../../engine/graph';
import type { Health, Tool, ToolId } from '../../model/schema';
import { useEntityMap, useStore } from '../../store';
import { Card, HealthBadge, HealthDot, HealthRing, PageHeader, PlainSeverity, SEVERITY_DOT, ToolSquare } from '../components/common';
import { healthScore, isActiveAnomaly, isActiveIssue, toolEdges, toolHealth, type ToolEdge } from '../derive';
import { useActiveProblems } from '../hooks';
import { HEALTH, TOOLS, TOOL_ORDER } from '../meta';

const POSITIONS: Record<ToolId, { x: number; y: number }> = {
  site: { x: 0, y: 190 },
  gtm_web: { x: 250, y: 190 },
  gtm_server: { x: 500, y: 350 },
  google_ads: { x: 770, y: -20 },
  ga4: { x: 770, y: 190 },
  meta: { x: 770, y: 390 },
};

interface ToolNodeData extends Record<string, unknown> {
  tool: Tool;
  health: Health;
  issues: number;
  anomalies: number;
  detail: string;
  dim: boolean;
}

const NODE_RING: Partial<Record<Health, string>> = {
  broken: 'border-rose-400/70 shadow-[inset_0_1px_0_rgba(255,255,255,.9),0_0_0_3px_rgba(244,63,94,.1),0_14px_30px_-18px_rgba(244,63,94,.6)]',
  degraded: 'border-amber-400/70 shadow-[inset_0_1px_0_rgba(255,255,255,.9),0_10px_30px_-14px_rgba(22,24,64,.2)]',
};

function ToolNode({ data }: NodeProps<Node<ToolNodeData>>) {
  const t = TOOLS[data.tool.id];
  const handle = '!h-1.5 !w-1.5 !min-h-0 !min-w-0 !border-0 !bg-slate-300';
  return (
    <div
      className={clsx(
        'w-[188px] cursor-pointer rounded-2xl border bg-white/75 px-3.5 py-3 backdrop-blur-md transition-[opacity,box-shadow] duration-200',
        NODE_RING[data.health] ?? 'border-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,.9),0_10px_30px_-14px_rgba(22,24,64,.2)]',
        'hover:ring-4 hover:ring-indigo-500/10',
        data.dim && 'opacity-30',
      )}
    >
      <Handle type="target" position={Position.Left} className={handle} />
      <Handle type="source" position={Position.Right} className={handle} />
      <Handle type="source" position={Position.Top} id="top" className={handle} />
      <Handle type="target" position={Position.Bottom} id="bottom" className={handle} />
      <div className="flex items-center gap-2">
        <ToolSquare tool={data.tool.id} />
        <span className="font-semibold text-slate-900">{data.tool.id === 'ga4' ? 'GA4' : t.label}</span>
        <HealthDot health={data.health} className="ml-auto" />
      </div>
      <div className="mt-0.5 truncate font-mono text-[11px] text-slate-500">{data.tool.externalId}</div>
      <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{data.detail}</div>
      <div className="mt-2 flex flex-wrap gap-1 text-[10.5px] font-medium">
        <span className={clsx('rounded-md px-1.5 py-0.5', data.issues ? 'bg-rose-500/10 text-rose-700' : 'bg-slate-900/[.04] text-slate-400')}>{data.issues} issues</span>
        <span className={clsx('rounded-md px-1.5 py-0.5', data.anomalies ? 'bg-amber-400/15 text-amber-800' : 'bg-slate-900/[.04] text-slate-400')}>{data.anomalies} anomalies</span>
      </div>
    </div>
  );
}

interface HealthEdgeData extends Record<string, unknown> {
  health: Health;
  count: number;
  dim: boolean;
}

const EDGE_STROKE: Record<Health, { color: string; width: number; dash?: string; opacity: number }> = {
  healthy: { color: '#10b981', width: 1.8, opacity: 0.55 },
  degraded: { color: '#f59e0b', width: 2, dash: '6 5', opacity: 0.8 },
  broken: { color: '#f43f5e', width: 2.4, opacity: 0.85 },
  inactive: { color: '#c8cbdc', width: 1.6, dash: '2 5', opacity: 0.8 },
  unknown: { color: '#8c91aa', width: 1.6, dash: '2 5', opacity: 0.8 },
};

/** A link between two tools. Still, coloured by its worst link; a broken one gets a marker where data stops. */
function HealthEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data }: EdgeProps<Edge<HealthEdgeData>>) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const h = data?.health ?? 'unknown';
  const s = EDGE_STROKE[h];
  const opacity = data?.dim ? 0.08 : s.opacity;
  const broken = h === 'broken';
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: s.color, strokeWidth: s.width, strokeDasharray: s.dash, opacity, transition: 'opacity 200ms', cursor: 'pointer' }} />
      {broken ? (
        // The marker takes the label's place; the link count is in its tooltip and the Connections table.
        <g style={{ opacity: data?.dim ? 0.12 : 1, transition: 'opacity 200ms', cursor: 'pointer' }}>
          <title>{`Data stops here · ${data?.count} link${data?.count === 1 ? '' : 's'}`}</title>
          <circle cx={labelX} cy={labelY} r={11} fill="#f43f5e" opacity={0.16} />
          <circle cx={labelX} cy={labelY} r={4.5} fill="#f43f5e" />
        </g>
      ) : (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute whitespace-nowrap rounded-full border border-slate-900/[.07] bg-white/90 px-2 py-0.5 text-[10.5px] font-medium text-slate-600 shadow-[0_2px_6px_-2px_rgba(22,24,64,.15)] transition-opacity duration-200"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, opacity: data?.dim ? 0.15 : 1 }}
          >
            {data?.count} link{data?.count === 1 ? '' : 's'}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { tool: ToolNode };
const edgeTypes = { health: HealthEdge };

function edgeLabel(byType: Record<string, number>) {
  return Object.entries(byType)
    .map(([type, n]) => `${n} ${FLOW_LABELS[type as keyof typeof FLOW_LABELS]}`)
    .join(' · ');
}

/** Every tool connected to `t`, upstream and downstream, and the edges between them. */
function traceFrom(t: ToolId, edges: ToolEdge[]) {
  const tools = new Set<ToolId>([t]);
  const keys = new Set<string>();
  for (const dir of ['down', 'up'] as const) {
    const queue = [t];
    while (queue.length) {
      const x = queue.shift()!;
      for (const e of edges) {
        const [a, b] = dir === 'down' ? [e.from, e.to] : [e.to, e.from];
        if (a !== x) continue;
        keys.add(`${e.from}>${e.to}`);
        if (!tools.has(b)) {
          tools.add(b);
          queue.push(b);
        }
      }
    }
  }
  return { tools, keys };
}

export function StackMap() {
  const navigate = useNavigate();
  const tools = useStore((s) => s.tools);
  const entities = useStore((s) => s.entities);
  const links = useStore((s) => s.links);
  const issues = useStore((s) => s.issues);
  const anomalies = useStore((s) => s.anomalies);
  const byId = useEntityMap();
  const active = useActiveProblems();
  const [hover, setHover] = useState<ToolId | null>(null);

  const edges = useMemo(() => toolEdges(entities, links), [entities, links]);
  const trace = hover ? traceFrom(hover, edges) : null;
  const activeIssues = issues.filter(isActiveIssue);
  const activeAnoms = anomalies.filter(isActiveAnomaly);
  const issueCount = (t: ToolId) => activeIssues.filter((i) => i.entityIds.some((id) => byId.get(id)?.tool === t)).length;

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
        issues: issueCount(t.id),
        anomalies: activeAnoms.filter((a) => byId.get(a.entityId)?.tool === t.id).length,
        detail,
        dim: !!trace && !trace.tools.has(t.id),
      },
    };
  });

  const flowEdges: Edge<HealthEdgeData>[] = edges.map((e) => {
    const vertical = e.from === 'ga4' && e.to === 'google_ads';
    const key = `${e.from}>${e.to}`;
    return {
      id: key,
      source: e.from,
      target: e.to,
      ...(vertical ? { sourceHandle: 'top', targetHandle: 'bottom' } : {}),
      type: 'health',
      data: { health: e.health, count: e.links.length, dim: !!trace && !trace.keys.has(key) },
      markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_STROKE[e.health].color, width: 14, height: 14 },
    };
  });

  const score = healthScore(issues);
  const bySeverity = (['critical', 'high', 'medium', 'low'] as const).map((s) => ({ s, n: active.filter((p) => p.severity === s).length }));
  const maxSeverity = Math.max(1, ...bySeverity.map((x) => x.n));
  const byTool = TOOL_ORDER.filter((t) => t !== 'site').map((t) => ({ t, n: active.filter((p) => p.tools.includes(t)).length }));
  const urgent = bySeverity[0].n;
  const important = bySeverity[1].n;

  return (
    <div>
      <PageHeader
        eyebrow="Explore the stack"
        title="Stack map"
        subtitle="How data moves through BrightPath Solar's stack. Each line summarises the links between two tools and takes the colour of the worst one; a red marker shows where data stops. Hover a tool to trace its path, click it to open the tool, or click a line to see the links behind it."
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="overflow-hidden">
          <div className="h-[420px] sm:h-[580px]">
            <ReactFlow
              nodes={nodes}
              edges={flowEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              fitViewOptions={{ padding: 0.1 }}
              minZoom={0.2}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              zoomOnScroll={false}
              panOnScroll={false}
              preventScrolling={false}
              proOptions={{ hideAttribution: true }}
              onNodeMouseEnter={(_, n) => setHover(n.id as ToolId)}
              onNodeMouseLeave={() => setHover(null)}
              onNodeClick={(_, n) => navigate(`/tools/${n.id}`)}
              onEdgeClick={(_, e) => {
                const [from, to] = e.id.split('>');
                navigate(`/relationships?from=${from}&to=${to}`);
              }}
            >
              <Background color="rgb(var(--slate-300))" gap={22} size={1.2} />
            </ReactFlow>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-900/[.06] px-5 py-3 text-xs text-slate-500">
            {(['healthy', 'degraded', 'broken', 'inactive'] as const).map((h) => (
              <span key={h} className="flex items-center gap-1.5">
                <svg width="20" height="6" aria-hidden>
                  <line x1="0" x2="20" y1="3" y2="3" stroke={EDGE_STROKE[h].color} strokeWidth={2} strokeDasharray={EDGE_STROKE[h].dash} />
                </svg>
                {HEALTH[h].label}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,.16)]" />
              Data stops here
            </span>
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="flex items-center gap-4 p-5">
            <HealthRing score={score} size="sm" />
            <div>
              <div className="font-display text-[15px] font-semibold tracking-tight text-slate-900">Stack health</div>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                {urgent} urgent and {important} important problems, {active.length} open in total.
              </p>
            </div>
          </Card>
          <TraceCard tool={hover} edges={edges} />
          <Card title="Open problems" actions={<Link to="/problems" className="text-xs font-medium text-indigo-600 hover:underline">View all</Link>}>
            <ul className="space-y-2.5 px-5 py-4">
              {bySeverity.map(({ s, n }) => (
                <li key={s}>
                  <Link to="/problems" className="grid grid-cols-[96px_minmax(0,1fr)_24px] items-center gap-3 text-sm">
                    <PlainSeverity severity={s} />
                    <span className="h-2 overflow-hidden rounded-full bg-slate-900/[.06]">
                      <span className={clsx('block h-full rounded-full transition-[width] duration-300 ease-out', SEVERITY_DOT[s])} style={{ width: `${(n / maxSeverity) * 100}%` }} />
                    </span>
                    <span className="text-right font-semibold tabular-nums">{n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="By tool">
            <ul className="divide-y divide-slate-900/[.06]">
              {byTool.map(({ t, n }) => (
                <li key={t}>
                  <Link
                    to={`/tools/${t}`}
                    onMouseEnter={() => setHover(t)}
                    onMouseLeave={() => setHover(null)}
                    className="flex items-center justify-between px-5 py-2.5 text-sm transition-colors hover:bg-white/50"
                  >
                    <span className="flex items-center gap-2">
                      <ToolSquare tool={t} />
                      {TOOLS[t].label}
                    </span>
                    <span className={clsx('tabular-nums', n ? 'font-semibold text-rose-600' : 'text-slate-400')}>{n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <Card className="mt-5" title="Connections">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr className="border-b border-slate-900/[.06]">
                <th className="px-5 py-2.5 font-medium">From</th>
                <th className="px-4 py-2.5 font-medium">To</th>
                <th className="px-4 py-2.5 font-medium">Links</th>
                <th className="px-4 py-2.5 font-medium">Health</th>
                <th className="px-4 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/[.06]">
              {edges.map((e) => (
                <tr key={`${e.from}>${e.to}`} className="transition-colors hover:bg-white/50">
                  <td className="px-5 py-2.5 font-medium">
                    <span className="flex items-center gap-2">
                      <ToolSquare tool={e.from} />
                      {TOOLS[e.from].label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-medium">
                    <span className="flex items-center gap-2">
                      <ToolSquare tool={e.to} />
                      {TOOLS[e.to].label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{edgeLabel(e.byType)}</td>
                  <td className="px-4 py-2.5">
                    <HealthBadge health={e.health} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
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

/** What the hovered tool receives, sends, and what's wrong with it. */
function TraceCard({ tool, edges }: { tool: ToolId | null; edges: ToolEdge[] }) {
  const entities = useStore((s) => s.entities);
  const tools = useStore((s) => s.tools);
  const active = useActiveProblems();
  if (!tool) {
    return (
      <Card className="min-h-[188px] p-5">
        <div className="font-display text-[15px] font-semibold tracking-tight text-slate-900">Trace a tool</div>
        <p className="mt-1.5 text-sm text-slate-500">Hover a tool on the map to see where its data comes from, where it goes, and what's wrong along the way.</p>
      </Card>
    );
  }
  const ext = tools.find((t) => t.id === tool)?.externalId;
  const ins = edges.filter((e) => e.to === tool);
  const outs = edges.filter((e) => e.from === tool);
  const ps = active.filter((p) => p.tools.includes(tool));
  return (
    <Card className="min-h-[188px] p-5">
      <div className="flex items-center gap-2 font-display text-base font-semibold tracking-tight text-slate-900">
        <ToolSquare tool={tool} />
        {TOOLS[tool].label}
        <HealthDot health={toolHealth(tool, entities)} className="ml-auto" />
      </div>
      <div className="mt-0.5 font-mono text-[11px] text-slate-500">{ext}</div>
      <ul className="mt-3 space-y-1.5 text-[12.5px] text-slate-600">
        {[...ins.map((e) => [e, `From ${TOOLS[e.from].short}`] as const), ...outs.map((e) => [e, `To ${TOOLS[e.to].short}`] as const)].map(([e, label]) => (
          <li key={label} className="flex items-center gap-2">
            <HealthDot health={e.health} />
            {label} · {e.links.length} link{e.links.length === 1 ? '' : 's'}
          </li>
        ))}
      </ul>
      {ps.length > 0 ? (
        <ul className="mt-3 space-y-2 border-t border-slate-900/[.06] pt-3 text-[12.5px] text-slate-700">
          {ps.slice(0, 3).map((p) => (
            <li key={p.id} className="flex items-start gap-2">
              <PlainSeverity severity={p.severity} />
              <span className="leading-snug">{p.headline}</span>
            </li>
          ))}
          {ps.length > 3 && <li className="text-slate-500">+ {ps.length - 3} more</li>}
        </ul>
      ) : (
        <p className="mt-3 border-t border-slate-900/[.06] pt-3 text-sm text-slate-500">No open problems here.</p>
      )}
    </Card>
  );
}
