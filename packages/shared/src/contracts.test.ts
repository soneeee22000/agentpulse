import { describe, expect, it } from 'vitest';
import { AgentEventSchema, IngestRequestSchema, StreamMessageSchema, toSseFrame } from './index.js';

describe('AgentEvent taxonomy', () => {
  it('parses a well-formed run.started event', () => {
    const parsed = AgentEventSchema.parse({
      type: 'run.started',
      runId: 'run-1',
      ts: 1_700_000_000_000,
      workflow: 'rag-pipeline',
    });
    expect(parsed.type).toBe('run.started');
  });

  it('defaults tool.called args to an empty object', () => {
    const parsed = AgentEventSchema.parse({
      type: 'tool.called',
      runId: 'run-1',
      ts: 1,
      spanId: 'span-1',
      tool: 'search',
    });
    if (parsed.type !== 'tool.called') throw new Error('wrong variant');
    expect(parsed.args).toEqual({});
  });

  it('rejects an unknown event type', () => {
    const result = AgentEventSchema.safeParse({ type: 'run.exploded', runId: 'x', ts: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects a negative token count on llm.usage', () => {
    const result = AgentEventSchema.safeParse({
      type: 'llm.usage',
      runId: 'r',
      ts: 1,
      spanId: 's',
      model: 'claude',
      promptTokens: -1,
      completionTokens: 10,
      costUsd: 0.01,
    });
    expect(result.success).toBe(false);
  });
});

describe('IngestRequest', () => {
  it('requires at least one event', () => {
    expect(IngestRequestSchema.safeParse({ events: [] }).success).toBe(false);
  });
});

describe('StreamMessage', () => {
  it('validates a metrics delta', () => {
    const msg = StreamMessageSchema.parse({
      type: 'metrics',
      metrics: {
        ts: 1,
        activeRuns: 2,
        throughputPerMin: 12,
        p50LatencyMs: 100,
        p95LatencyMs: 400,
        errorRate: 0.05,
        eventsPerSec: 8,
        totalRuns: 42,
        totalTokens: 1000,
        totalCostUsd: 0.5,
      },
    });
    expect(msg.type).toBe('metrics');
  });
});

describe('toSseFrame', () => {
  it('wraps a payload in a data frame terminated by a blank line', () => {
    expect(toSseFrame({ a: 1 })).toBe('data: {"a":1}\n\n');
  });
});
