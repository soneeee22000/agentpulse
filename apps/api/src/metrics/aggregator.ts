import type { AgentEvent, MetricsSnapshot } from '@pulse/shared';
import { percentile } from './quantile.js';

/** A completed run, retained only long enough to feed the rolling window. */
interface CompletedRun {
  endedAt: number;
  durationMs: number;
  errored: boolean;
}

export interface AggregatorOptions {
  /** Window for throughput / latency / error-rate, in ms. */
  windowMs?: number;
  /** Window for the events-per-second gauge, in ms. */
  eventsWindowMs?: number;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_EVENTS_WINDOW_MS = 5_000;
const MS_PER_MINUTE = 60_000;

/**
 * Rolling aggregator over the event stream.
 *
 * Throughput, latency percentiles and error rate are computed over a sliding
 * time window (default 60s); cumulative totals (runs, tokens, cost) grow for
 * the lifetime of the process. The window is pruned lazily at `snapshot()`
 * time against a caller-supplied `now`, so the math is deterministic and unit
 * testable without faking timers.
 */
export class Aggregator {
  private readonly windowMs: number;
  private readonly eventsWindowMs: number;

  private readonly completed: CompletedRun[] = [];
  private readonly eventTimes: number[] = [];

  private totalRuns = 0;
  private totalTokens = 0;
  private totalCostUsd = 0;

  constructor(options: AggregatorOptions = {}) {
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.eventsWindowMs = options.eventsWindowMs ?? DEFAULT_EVENTS_WINDOW_MS;
  }

  /** Fold one event into the rolling state. */
  record(event: AgentEvent): void {
    this.eventTimes.push(event.ts);
    if (event.type === 'run.ended') {
      this.completed.push({
        endedAt: event.ts,
        durationMs: event.durationMs,
        errored: event.status === 'error',
      });
      this.totalRuns += 1;
      this.totalTokens += event.totalTokens;
      this.totalCostUsd += event.totalCostUsd;
    }
  }

  /** Compute the current rolling metrics as of `now` (epoch ms). */
  snapshot(now: number, activeRuns: number): MetricsSnapshot {
    this.prune(now);

    const durations = this.completed.map((r) => r.durationMs);
    const errorCount = this.completed.reduce((n, r) => n + (r.errored ? 1 : 0), 0);
    const windowMinutes = this.windowMs / MS_PER_MINUTE;
    const eventsWindowSeconds = this.eventsWindowMs / 1000;

    return {
      ts: now,
      activeRuns,
      throughputPerMin: round(this.completed.length / windowMinutes, 2),
      p50LatencyMs: round(percentile(durations, 0.5), 1),
      p95LatencyMs: round(percentile(durations, 0.95), 1),
      errorRate: this.completed.length === 0 ? 0 : round(errorCount / this.completed.length, 4),
      eventsPerSec: round(this.eventTimes.length / eventsWindowSeconds, 2),
      totalRuns: this.totalRuns,
      totalTokens: this.totalTokens,
      totalCostUsd: round(this.totalCostUsd, 6),
    };
  }

  /** Drop window entries older than their respective horizons. */
  private prune(now: number): void {
    dropOlderThan(this.completed, now - this.windowMs, (r) => r.endedAt);
    dropOlderThan(this.eventTimes, now - this.eventsWindowMs, (t) => t);
  }
}

/** Remove leading entries (oldest-first arrays) whose timestamp is below `cutoff`. */
function dropOlderThan<T>(arr: T[], cutoff: number, tsOf: (item: T) => number): void {
  let drop = 0;
  while (drop < arr.length && tsOf(arr[drop]!) < cutoff) drop += 1;
  if (drop > 0) arr.splice(0, drop);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
