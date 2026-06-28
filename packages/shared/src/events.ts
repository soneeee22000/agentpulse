import { z } from 'zod';

/**
 * The AgentPulse event taxonomy — the wire protocol every agent speaks.
 *
 * Agents (or the built-in simulator) emit these OpenTelemetry-flavored events
 * as a run executes. The same discriminated union is consumed by the ingest
 * route, the aggregator, the SSE fan-out, and the Vue store — so the protocol
 * can never drift between producer and consumer. Validate at every boundary;
 * infer the TS types from the schemas, never redefine them by hand.
 *
 * `ts` is an epoch-millisecond integer (one clock, easy arithmetic).
 */

/** The ordered phases of a typical agentic run. */
export const SpanKindSchema = z.enum(['plan', 'retrieve', 'tool', 'llm', 'synthesize']);
export type SpanKind = z.infer<typeof SpanKindSchema>;

/** Terminal status for a span or a run. */
export const FinishStatusSchema = z.enum(['ok', 'error']);
export type FinishStatus = z.infer<typeof FinishStatusSchema>;

export const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
export type LogLevel = z.infer<typeof LogLevelSchema>;

/** Fields shared by every event. Spread into each member of the union. */
const baseShape = {
  runId: z.string().min(1),
  /** Epoch milliseconds. */
  ts: z.number().int().nonnegative(),
} as const;

export const AgentEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('run.started'),
    ...baseShape,
    workflow: z.string().min(1),
    input: z.string().optional(),
  }),
  z.object({
    type: z.literal('span.started'),
    ...baseShape,
    spanId: z.string().min(1),
    parentId: z.string().min(1).optional(),
    name: z.string().min(1),
    kind: SpanKindSchema,
  }),
  z.object({
    type: z.literal('tool.called'),
    ...baseShape,
    spanId: z.string().min(1),
    tool: z.string().min(1),
    args: z.record(z.unknown()).default({}),
  }),
  z.object({
    type: z.literal('llm.usage'),
    ...baseShape,
    spanId: z.string().min(1),
    model: z.string().min(1),
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative(),
  }),
  z.object({
    type: z.literal('span.ended'),
    ...baseShape,
    spanId: z.string().min(1),
    status: FinishStatusSchema,
    error: z.string().optional(),
  }),
  z.object({
    type: z.literal('run.ended'),
    ...baseShape,
    status: FinishStatusSchema,
    durationMs: z.number().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    totalCostUsd: z.number().nonnegative(),
  }),
  z.object({
    type: z.literal('log'),
    ...baseShape,
    spanId: z.string().min(1).optional(),
    level: LogLevelSchema,
    message: z.string(),
  }),
]);
export type AgentEvent = z.infer<typeof AgentEventSchema>;

/** Every event `type` literal, useful for exhaustive UI handling. */
export type AgentEventType = AgentEvent['type'];

/** Serialize a value as a single SSE `data:` frame. */
export function toSseFrame(event: unknown): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
