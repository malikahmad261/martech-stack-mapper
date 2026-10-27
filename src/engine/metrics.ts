import type { MetricName, MetricPoint } from '../model/schema';

// Fast lookup of daily series. Dimensioned points (e.g. by channel or placement) are kept separately
// from the entity's totals, so totals never double count.

export class MetricIndex {
  readonly dates: string[];
  private dateIdx: Map<string, number>;
  private series = new Map<string, number[]>();

  constructor(points: MetricPoint[]) {
    this.dates = [...new Set(points.map((p) => p.date))].sort();
    this.dateIdx = new Map(this.dates.map((d, i) => [d, i]));
    for (const p of points) {
      const key = MetricIndex.key(p.entityId, p.metric, p.dimensions);
      let s = this.series.get(key);
      if (!s) this.series.set(key, (s = new Array(this.dates.length).fill(0)));
      s[this.dateIdx.get(p.date)!] += p.value;
    }
  }

  static key(entityId: string, metric: MetricName, dims?: Record<string, string>) {
    const d = dims ? Object.entries(dims).sort().map(([k, v]) => `${k}=${v}`).join(',') : '';
    return `${entityId}|${metric}|${d}`;
  }

  has(entityId: string, metric: MetricName, dims?: Record<string, string>) {
    return this.series.has(MetricIndex.key(entityId, metric, dims));
  }

  get(entityId: string, metric: MetricName, dims?: Record<string, string>): number[] {
    return this.series.get(MetricIndex.key(entityId, metric, dims)) ?? new Array(this.dates.length).fill(0);
  }

  /** Sum of several series, element-wise. */
  sum(series: number[][]): number[] {
    return this.dates.map((_, i) => series.reduce((a, s) => a + (s[i] ?? 0), 0));
  }

  /** All dimension values recorded for an entity/metric, e.g. every channel. */
  dimensionValues(entityId: string, metric: MetricName, dim: string): string[] {
    const prefix = `${entityId}|${metric}|${dim}=`;
    return [...this.series.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
  }

  /** Total over the last n days (ending at the latest date). */
  last(series: number[], n: number) {
    return series.slice(-n).reduce((a, b) => a + b, 0);
  }

  /** Average daily value for the window [-(offset+n), -offset). */
  avg(series: number[], n: number, offset = 0) {
    const s = series.slice(series.length - offset - n, series.length - offset);
    return s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0;
  }
}
