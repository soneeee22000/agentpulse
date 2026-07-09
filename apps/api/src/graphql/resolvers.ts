import { GraphQLScalarType, Kind, valueFromASTUntyped } from 'graphql';
// mercurius is CommonJS: under native ESM only its default export exists, so
// `ErrorWithProps` must be reached through it. Vitest's interop hides this.
import mercurius, { type IResolvers } from 'mercurius';
import {
  IngestRequestSchema,
  LifecycleStatusSchema,
  type AgentEvent,
  type RunDetail,
  type RunSummary,
  type SpanRecord,
} from '@pulse/shared';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { subscribeToEvents } from './eventStream.js';

const RunsArgsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: LifecycleStatusSchema.optional(),
});

/** A `Run` parent is a summary from the list, or a detail from a point lookup. */
type RunParent = RunSummary & Partial<Pick<RunDetail, 'input' | 'spans'>>;

/** Maps the event `type` discriminant onto its GraphQL type name. */
const EVENT_TYPE_NAMES: Record<AgentEvent['type'], string> = {
  'run.started': 'RunStarted',
  'span.started': 'SpanStarted',
  'tool.called': 'ToolCalled',
  'llm.usage': 'LlmUsage',
  'span.ended': 'SpanEnded',
  'run.ended': 'RunEnded',
  log: 'LogLine',
};

/**
 * Passthrough scalar for the free-form corners of the protocol: a `tool.called`
 * event's `args`, and the `ingest` mutation's event payloads (which zod — not
 * GraphQL — validates, so the two ingest paths cannot drift).
 */
export const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'An arbitrary JSON value.',
  serialize: (value: unknown): unknown => value,
  parseValue: (value: unknown): unknown => value,
  parseLiteral: (ast): unknown =>
    ast.kind === Kind.NULL ? null : valueFromASTUntyped(ast, undefined),
});

/**
 * Build the resolver map over a live {@link AppContext}.
 *
 * Resolvers close over the context rather than reading it off the GraphQL
 * request context, so they can be exercised directly in unit tests with a bare
 * `AppContext` and no Fastify instance.
 */
export function createResolvers(ctx: AppContext): IResolvers {
  return {
    JSON: JSONScalar,

    AgentEvent: {
      resolveType: (event: AgentEvent): string => EVENT_TYPE_NAMES[event.type],
    },

    Run: {
      spans: (parent: RunParent): SpanRecord[] =>
        parent.spans ?? ctx.store.getRun(parent.runId)?.spans ?? [],
      input: (parent: RunParent): string | null =>
        parent.input ?? ctx.store.getRun(parent.runId)?.input ?? null,
    },

    Query: {
      health: () => ({
        status: 'ok',
        busDriver: ctx.bus.driver,
        activeRuns: ctx.store.activeRuns,
        totalRuns: ctx.store.totalRuns,
        simRunning: ctx.simulator.running,
      }),

      metrics: () => ctx.metrics(),

      runs: (_root: unknown, args: unknown) => {
        const parsed = RunsArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new mercurius.ErrorWithProps(parsed.error.message, { code: 'invalid_query' });
        }
        return {
          runs: ctx.store.listRuns(parsed.data.limit, parsed.data.status),
          total: ctx.store.totalRuns,
        };
      },

      run: (_root: unknown, args: { runId: string }): RunDetail | null =>
        ctx.store.getRun(args.runId) ?? null,
    },

    Mutation: {
      ingest: async (_root: unknown, args: { events: unknown[] }) => {
        const parsed = IngestRequestSchema.safeParse({ events: args.events });
        if (!parsed.success) {
          throw new mercurius.ErrorWithProps(parsed.error.message, { code: 'invalid_request' });
        }
        for (const event of parsed.data.events) {
          await ctx.ingest(event);
        }
        return { accepted: parsed.data.events.length };
      },

      startSimulator: () => {
        ctx.simulator.start();
        return { running: ctx.simulator.running };
      },

      stopSimulator: () => {
        ctx.simulator.stop();
        return { running: ctx.simulator.running };
      },
    },

    Subscription: {
      agentEvents: {
        subscribe: async function* (_root: unknown, args: { runId?: string }) {
          for await (const event of subscribeToEvents(ctx.sse, args.runId)) {
            yield { agentEvents: event };
          }
        },
      },
    },
  };
}
