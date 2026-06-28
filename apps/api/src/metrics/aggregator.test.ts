import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '@pulse/shared';
import { Aggregator } from './aggregator.js';

function runEnded(ts: number, durationMs: number, errored = false): AgentEvent {
  return {
    type: 'run.ended',
    runId: `run-${ts}`,
    ts,
    status: errored ? 'error' : 'ok',
    durationMs,
    totalTokens: 100,
    totalCostUsd: 0.01,
  };
}

describe('Aggregator', () => {
  it('reports zeroed metrics with no data', () => {
    const agg = new Aggregator();
    const snap = agg.snapshot(1000, 0);
    expect(snap.throughputPerMin).toBe(0);
    expect(snap.p95LatencyMs).toBe(0);
    expect(snap.errorRate).toBe(0);
    expect(snap.totalRuns).toBe(0);
  });

  it('accumulates lifetime totals from run.ended events', () => {
    const agg = new Aggregator();
    agg.record(runEnded(1000, 200));
    agg.record(runEnded(2000, 400));
    const snap = agg.snapshot(2000, 1);
    expect(snap.totalRuns).toBe(2);
    expect(snap.totalTokens).toBe(200);
    expect(snap.totalCostUsd).toBeCloseTo(0.02, 6);
    expect(snap.activeRuns).toBe(1);
  });

  it('computes latency percentiles over the window', () => {
    const agg = new Aggregator();
    for (let i = 1; i <= 10; i += 1) agg.record(runEnded(1000 + i, i * 100));
    const snap = agg.snapshot(2000, 0);
    expect(snap.p50LatencyMs).toBe(550); // median of 100..1000
    expect(snap.p95LatencyMs).toBeCloseTo(955, 0);
  });

  it('computes error rate within the window', () => {
    const agg = new Aggregator();
    agg.record(runEnded(1000, 100, false));
    agg.record(runEnded(1100, 100, true));
    agg.record(runEnded(1200, 100, false));
    agg.record(runEnded(1300, 100, true));
    expect(agg.snapshot(1300, 0).errorRate).toBe(0.5);
  });

  it('evicts runs older than the rolling window', () => {
    const agg = new Aggregator({ windowMs: 10_000 });
    agg.record(runEnded(1000, 100)); // old
    agg.record(runEnded(20_000, 200)); // fresh
    const snap = agg.snapshot(25_000, 0);
    // Only the fresh run is inside [15_000, 25_000].
    expect(snap.p50LatencyMs).toBe(200);
    // ...but lifetime totals still count both.
    expect(snap.totalRuns).toBe(2);
  });

  it('derives throughput per minute from the window count', () => {
    const agg = new Aggregator({ windowMs: 60_000 });
    for (let i = 0; i < 6; i += 1) agg.record(runEnded(1000 + i * 10, 100));
    // 6 runs in a 60s window → 6 runs/min.
    expect(agg.snapshot(1100, 0).throughputPerMin).toBe(6);
  });
});
