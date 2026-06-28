import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '@pulse/shared';
import { RunStore } from './runStore.js';

function feed(store: RunStore, events: AgentEvent[]): void {
  for (const e of events) store.apply(e);
}

const runId = 'run-1';

function fullRun(): AgentEvent[] {
  return [
    { type: 'run.started', runId, ts: 1000, workflow: 'rag', input: 'q?' },
    { type: 'span.started', runId, ts: 1010, spanId: 's1', name: 'plan', kind: 'plan' },
    { type: 'span.ended', runId, ts: 1050, spanId: 's1', status: 'ok' },
    { type: 'span.started', runId, ts: 1060, spanId: 's2', name: 'call llm', kind: 'llm' },
    {
      type: 'llm.usage',
      runId,
      ts: 1070,
      spanId: 's2',
      model: 'claude-sonnet-4-6',
      promptTokens: 500,
      completionTokens: 120,
      costUsd: 0.004,
    },
    { type: 'span.ended', runId, ts: 1200, spanId: 's2', status: 'ok' },
    {
      type: 'run.ended',
      runId,
      ts: 1210,
      status: 'ok',
      durationMs: 210,
      totalTokens: 620,
      totalCostUsd: 0.004,
    },
  ];
}

describe('RunStore', () => {
  it('projects a full run into a summary', () => {
    const store = new RunStore();
    feed(store, fullRun());
    const [summary] = store.listRuns();
    expect(summary?.status).toBe('ok');
    expect(summary?.spanCount).toBe(2);
    expect(summary?.totalTokens).toBe(620);
    expect(summary?.durationMs).toBe(210);
    expect(store.totalRuns).toBe(1);
    expect(store.activeRuns).toBe(0);
  });

  it('builds a span waterfall with durations and llm usage', () => {
    const store = new RunStore();
    feed(store, fullRun());
    const detail = store.getRun(runId);
    expect(detail?.spans).toHaveLength(2);
    const llm = detail?.spans.find((s) => s.kind === 'llm');
    expect(llm?.durationMs).toBe(140);
    expect(llm?.model).toBe('claude-sonnet-4-6');
    expect(llm?.completionTokens).toBe(120);
  });

  it('counts a run as active until it ends', () => {
    const store = new RunStore();
    store.apply({ type: 'run.started', runId, ts: 1, workflow: 'rag' });
    expect(store.activeRuns).toBe(1);
    store.apply({
      type: 'run.ended',
      runId,
      ts: 2,
      status: 'ok',
      durationMs: 1,
      totalTokens: 0,
      totalCostUsd: 0,
    });
    expect(store.activeRuns).toBe(0);
  });

  it('tallies errored spans', () => {
    const store = new RunStore();
    store.apply({ type: 'run.started', runId, ts: 1, workflow: 'rag' });
    store.apply({ type: 'span.started', runId, ts: 2, spanId: 's', name: 'tool', kind: 'tool' });
    store.apply({ type: 'span.ended', runId, ts: 3, spanId: 's', status: 'error', error: 'boom' });
    expect(store.listRuns()[0]?.errorCount).toBe(1);
    expect(store.getRun(runId)?.spans[0]?.error).toBe('boom');
  });

  it('ignores events for an unknown run', () => {
    const store = new RunStore();
    expect(
      store.apply({
        type: 'span.started',
        runId: 'ghost',
        ts: 1,
        spanId: 'x',
        name: 'n',
        kind: 'plan',
      }),
    ).toBeNull();
  });

  it('evicts the oldest run past the ring-buffer cap', () => {
    const store = new RunStore(2);
    for (let i = 0; i < 3; i += 1) {
      store.apply({ type: 'run.started', runId: `r${i}`, ts: i, workflow: 'w' });
    }
    expect(store.listRuns()).toHaveLength(2);
    expect(store.getRun('r0')).toBeUndefined();
    expect(store.getRun('r2')).toBeDefined();
    expect(store.totalRuns).toBe(3);
  });

  it('filters runs by status', () => {
    const store = new RunStore();
    store.apply({ type: 'run.started', runId: 'a', ts: 1, workflow: 'w' });
    store.apply({ type: 'run.started', runId: 'b', ts: 2, workflow: 'w' });
    store.apply({
      type: 'run.ended',
      runId: 'b',
      ts: 3,
      status: 'ok',
      durationMs: 1,
      totalTokens: 0,
      totalCostUsd: 0,
    });
    expect(store.listRuns(50, 'running').map((r) => r.runId)).toEqual(['a']);
    expect(store.listRuns(50, 'ok').map((r) => r.runId)).toEqual(['b']);
  });
});
