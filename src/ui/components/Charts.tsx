import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MetricIndex } from '../../engine/metrics';
import type { Entity } from '../../model/schema';
import { METRICS } from '../../store';
import { fmtDate, fmtNum } from '../meta';

export const metricIndex = new MetricIndex(METRICS);

export interface Series {
  key: string;
  label: string;
  values: number[];
  color: string;
  axis?: 'left' | 'right';
  dashed?: boolean;
}

/** Default series to chart for an entity, if it has any metrics. */
export function seriesFor(e: Entity): Series[] {
  const m = metricIndex;
  switch (e.kind) {
    case 'gads_campaign':
    case 'meta_campaign':
      return [
        { key: 'spend', label: 'Spend ($)', values: m.get(e.id, 'spend'), color: '#6366f1' },
        { key: 'clicks', label: 'Clicks', values: m.get(e.id, 'clicks'), color: '#0ea5e9', axis: 'right' },
        { key: 'conv', label: 'Conversions', values: m.get(e.id, 'conversions'), color: '#10b981', axis: 'right' },
      ];
    case 'gads_conversion_action':
      return [{ key: 'conv', label: 'Conversions', values: m.get(e.id, 'conversions'), color: '#10b981' }];
    case 'ga4_event':
      return m.has(e.id, 'events') ? [{ key: 'events', label: 'Events', values: m.get(e.id, 'events'), color: '#ea580c' }] : [];
    case 'meta_event':
      return [
        { key: 'b', label: 'Browser (Pixel)', values: m.get(e.id, 'events_browser'), color: '#7c3aed' },
        { key: 's', label: 'Server (CAPI)', values: m.get(e.id, 'events_server'), color: '#0891b2' },
      ].filter((s) => s.values.some((v) => v > 0));
    case 'ga4_stream': {
      const chs = m.dimensionValues(e.id, 'sessions', 'channel');
      return [
        { key: 'sessions', label: 'Sessions', values: m.sum(chs.map((c) => m.get(e.id, 'sessions', { channel: c }))), color: '#ea580c' },
        { key: 'engaged', label: 'Engaged sessions', values: m.sum(chs.map((c) => m.get(e.id, 'engaged_sessions', { channel: c }))), color: '#10b981' },
      ];
    }
    default:
      return [];
  }
}

export function MetricChart({
  series,
  height = 220,
  window,
  windowColor = '#f43f5e',
  markers = [],
  days = 90,
}: {
  series: Series[];
  height?: number;
  window?: { start: string; end: string };
  windowColor?: string;
  markers?: { date: string; label: string }[];
  days?: number;
}) {
  const dates = metricIndex.dates.slice(-days);
  const offset = metricIndex.dates.length - dates.length;
  const data = dates.map((d, i) => ({ date: d, ...Object.fromEntries(series.map((s) => [s.key, s.values[offset + i]])) }));
  const hasRight = series.some((s) => s.axis === 'right');
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: hasRight ? 0 : 8, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(d) => fmtDate(`${d}T00:00:00Z`)} tick={{ fontSize: 11, fill: '#94a3b8' }} minTickGap={36} axisLine={false} tickLine={false} />
          <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={44} tickFormatter={fmtNum} />
          {hasRight && <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={40} tickFormatter={fmtNum} />}
          <Tooltip
            labelFormatter={(d) => fmtDate(`${d}T00:00:00Z`)}
            formatter={(v: number, name: string) => [fmtNum(v), series.find((s) => s.key === name)?.label ?? name]}
            contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#e2e8f0' }}
          />
          {series.length > 1 && <Legend formatter={(k) => series.find((s) => s.key === k)?.label ?? k} wrapperStyle={{ fontSize: 12 }} iconType="plainline" />}
          {window && <ReferenceArea yAxisId="left" x1={window.start} x2={window.end} fill={windowColor} fillOpacity={0.08} stroke={windowColor} strokeOpacity={0.3} />}
          {markers
            .filter((m) => dates.includes(m.date))
            .map((m) => (
              <ReferenceLine key={m.date + m.label} yAxisId="left" x={m.date} stroke="#475569" strokeDasharray="3 3" label={{ value: m.label, position: 'insideTopLeft', fontSize: 10, fill: '#475569' }} />
            ))}
          {series.map((s) => (
            <Line key={s.key} yAxisId={s.axis ?? 'left'} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} strokeDasharray={s.dashed ? '4 3' : undefined} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
