import { z } from 'zod';
import { AgentEventSchema } from './events.js';
import { MetricsSnapshotSchema, RunSummarySchema } from './metrics.js';

/**
 * HTTP + SSE contracts. Ingestion is a POST batch; everything else the
 * dashboard needs streams over `/api/stream`, with REST for point lookups.
 */

export const BusDriverSchema = z.enum(['memory', 'pubsub']);
export type BusDriver = z.infer<typeof BusDriverSchema>;

/** Ingest a batch of agent events. */
export const IngestRequestSchema = z.object({
  events: z.array(AgentEventSchema).min(1).max(1000),
});
export type IngestRequest = z.infer<typeof IngestRequestSchema>;

export const IngestResponseSchema = z.object({
  accepted: z.number().int().nonnegative(),
});
export type IngestResponse = z.infer<typeof IngestResponseSchema>;

export const RunListResponseSchema = z.object({
  runs: z.array(RunSummarySchema),
  total: z.number().int().nonnegative(),
});
export type RunListResponse = z.infer<typeof RunListResponseSchema>;

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  busDriver: BusDriverSchema,
  activeRuns: z.number().int().nonnegative(),
  totalRuns: z.number().int().nonnegative(),
  simRunning: z.boolean(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const SimStateSchema = z.object({
  running: z.boolean(),
});
export type SimState = z.infer<typeof SimStateSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * Messages pushed over the SSE stream. `snapshot` is sent once on connect to
 * hydrate the dashboard; the rest are live deltas. Discriminated on `type`.
 */
export const StreamMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('snapshot'),
    metrics: MetricsSnapshotSchema,
    /** Recent metric ticks so the charts render a curve on first paint. */
    history: z.array(MetricsSnapshotSchema),
    runs: z.array(RunSummarySchema),
  }),
  z.object({ type: z.literal('metrics'), metrics: MetricsSnapshotSchema }),
  z.object({ type: z.literal('run'), run: RunSummarySchema }),
  z.object({ type: z.literal('event'), event: AgentEventSchema }),
]);
export type StreamMessage = z.infer<typeof StreamMessageSchema>;
