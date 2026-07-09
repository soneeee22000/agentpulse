import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AgentEvent } from '@pulse/shared';
import type { Config } from '../config.js';
import { AppContext } from '../context.js';
import { buildServer } from '../server.js';

const TEST_CONFIG: Config = {
  PORT: 0,
  HOST: '127.0.0.1',
  CORS_ORIGIN: '*',
  BUS_DRIVER: 'memory',
  SIM_AUTOSTART: false,
  GRAPHIQL: false,
  PUBSUB_TOPIC: 'agentpulse-events',
  PUBSUB_SUBSCRIPTION: 'agentpulse-events-sub',
  KAFKA_BROKERS: ['localhost:9092'],
  KAFKA_TOPIC: 'agentpulse-events',
  KAFKA_GROUP_ID: 'agentpulse-api',
  KAFKA_CLIENT_ID: 'agentpulse',
};

const RUN_ID = 'run-1';
const SPAN_ID = 'span-1';

const EVENTS: AgentEvent[] = [
  { type: 'run.started', runId: RUN_ID, ts: 1000, workflow: 'rag', input: 'why is the sky blue' },
  {
    type: 'span.started',
    runId: RUN_ID,
    ts: 1010,
    spanId: SPAN_ID,
    name: 'retrieve',
    kind: 'retrieve',
  },
  {
    type: 'tool.called',
    runId: RUN_ID,
    ts: 1020,
    spanId: SPAN_ID,
    tool: 'vector_search',
    args: { k: 5 },
  },
  { type: 'span.ended', runId: RUN_ID, ts: 1050, spanId: SPAN_ID, status: 'ok' },
  {
    type: 'run.ended',
    runId: RUN_ID,
    ts: 1100,
    status: 'ok',
    durationMs: 100,
    totalTokens: 42,
    totalCostUsd: 0.001,
  },
];

interface GraphqlBody {
  data?: Record<string, unknown>;
  errors?: Array<{ message: string }>;
}

let app: FastifyInstance;
let ctx: AppContext;

async function gql(query: string, variables?: Record<string, unknown>): Promise<GraphqlBody> {
  const response = await app.inject({
    method: 'POST',
    url: '/graphql',
    payload: { query, ...(variables ? { variables } : {}) },
  });
  return response.json<GraphqlBody>();
}

beforeEach(async () => {
  ctx = new AppContext(TEST_CONFIG);
  app = await buildServer({ config: TEST_CONFIG, context: ctx });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('GraphQL queries', () => {
  it('reports health with the active bus driver', async () => {
    const body = await gql('{ health { status busDriver activeRuns totalRuns simRunning } }');
    expect(body.errors).toBeUndefined();
    expect(body.data?.health).toEqual({
      status: 'ok',
      busDriver: 'memory',
      activeRuns: 0,
      totalRuns: 0,
      simRunning: false,
    });
  });

  it('serves metrics', async () => {
    const body = await gql('{ metrics { activeRuns totalRuns errorRate } }');
    expect(body.errors).toBeUndefined();
    expect(body.data?.metrics).toMatchObject({ activeRuns: 0, totalRuns: 0, errorRate: 0 });
  });

  it('lists runs projected from ingested events', async () => {
    for (const event of EVENTS) await ctx.ingest(event);

    const body = await gql(
      '{ runs { total runs { runId workflow status spanCount totalTokens } } }',
    );
    expect(body.errors).toBeUndefined();
    expect(body.data?.runs).toEqual({
      total: 1,
      runs: [{ runId: RUN_ID, workflow: 'rag', status: 'ok', spanCount: 1, totalTokens: 42 }],
    });
  });

  it('filters runs by status and rejects an out-of-range limit', async () => {
    for (const event of EVENTS) await ctx.ingest(event);

    const matching = await gql('{ runs(status: ok) { runs { runId } } }');
    expect(matching.data?.runs).toEqual({ runs: [{ runId: RUN_ID }] });

    const empty = await gql('{ runs(status: running) { runs { runId } } }');
    expect(empty.data?.runs).toEqual({ runs: [] });

    const invalid = await gql('{ runs(limit: 5000) { total } }');
    expect(invalid.errors?.[0]?.message).toContain('less than or equal to 200');
  });

  it('resolves spans and input lazily, only when selected', async () => {
    for (const event of EVENTS) await ctx.ingest(event);

    const shallow = await gql('{ runs { runs { runId } } }');
    expect(shallow.data?.runs).toEqual({ runs: [{ runId: RUN_ID }] });

    const deep = await gql(
      `{ run(runId: "${RUN_ID}") { input spans { spanId kind status tool } } }`,
    );
    expect(deep.errors).toBeUndefined();
    expect(deep.data?.run).toEqual({
      input: 'why is the sky blue',
      spans: [{ spanId: SPAN_ID, kind: 'retrieve', status: 'ok', tool: 'vector_search' }],
    });
  });

  it('resolves spans on a run reached through the list query', async () => {
    for (const event of EVENTS) await ctx.ingest(event);

    const body = await gql('{ runs { runs { runId spans { spanId } } } }');
    expect(body.errors).toBeUndefined();
    expect(body.data?.runs).toEqual({
      runs: [{ runId: RUN_ID, spans: [{ spanId: SPAN_ID }] }],
    });
  });

  it('returns null for an unknown run', async () => {
    const body = await gql('{ run(runId: "nope") { runId } }');
    expect(body.errors).toBeUndefined();
    expect(body.data?.run).toBeNull();
  });
});

describe('GraphQL mutations', () => {
  it('ingests events onto the bus and projects them', async () => {
    const body = await gql(
      'mutation Ingest($events: [JSON!]!) { ingest(events: $events) { accepted } }',
      {
        events: EVENTS,
      },
    );

    expect(body.errors).toBeUndefined();
    expect(body.data?.ingest).toEqual({ accepted: EVENTS.length });
    expect(ctx.store.totalRuns).toBe(1);
  });

  it('rejects a malformed event batch with the shared zod schema', async () => {
    const body = await gql(
      'mutation Ingest($events: [JSON!]!) { ingest(events: $events) { accepted } }',
      {
        events: [{ type: 'not.a.real.event' }],
      },
    );

    expect(body.data?.ingest).toBeFalsy();
    expect(body.errors?.[0]?.message).toBeTruthy();
    expect(ctx.store.totalRuns).toBe(0);
  });

  it('starts and stops the simulator', async () => {
    const started = await gql('mutation { startSimulator { running } }');
    expect(started.data?.startSimulator).toEqual({ running: true });

    const stopped = await gql('mutation { stopSimulator { running } }');
    expect(stopped.data?.stopSimulator).toEqual({ running: false });
  });
});

describe('AgentEvent interface', () => {
  it('resolves each event type to its concrete GraphQL type', async () => {
    for (const event of EVENTS) await ctx.ingest(event);

    const body = await gql(`{
      run(runId: "${RUN_ID}") { runId }
    }`);
    expect(body.errors).toBeUndefined();

    // The interface is exercised through introspection: every event type must
    // be a member, or the subscription cannot serialize that event.
    const introspection = await gql('{ __type(name: "AgentEvent") { possibleTypes { name } } }');
    const names = (
      introspection.data?.__type as { possibleTypes: Array<{ name: string }> }
    ).possibleTypes.map((t) => t.name);

    expect(names.sort()).toEqual(
      [
        'LlmUsage',
        'LogLine',
        'RunEnded',
        'RunStarted',
        'SpanEnded',
        'SpanStarted',
        'ToolCalled',
      ].sort(),
    );
  });
});
