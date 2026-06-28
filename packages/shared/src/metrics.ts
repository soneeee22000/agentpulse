import { z } from 'zod';
import { SpanKindSchema } from './events.js';

/**
 * Read-model contracts: the shapes the API derives from the event stream and
 * serves to the dashboard. These are projections of {@link AgentEvent}s, not
 * raw events.
 */

/** A run/span is `running` until it ends `ok` or `error`. */
export const LifecycleStatusSchema = z.enum(['running', 'ok', 'error']);
export type LifecycleStatus = z.infer<typeof LifecycleStatusSchema>;

/** One row in the live runs feed. */
export const RunSummarySchema = z.object({
  runId: z.string().min(1),
  workflow: z.string().min(1),
  status: LifecycleStatusSchema,
  /** Epoch ms when the run started. */
  startedAt: z.number().int().nonnegative(),
  /** Wall-clock duration in ms, set once the run ends. */
  durationMs: z.number().nonnegative().optional(),
  spanCount: z.number().int().nonnegative().default(0),
  errorCount: z.number().int().nonnegative().default(0),
  totalTokens: z.number().int().nonnegative().default(0),
  totalCostUsd: z.number().nonnegative().default(0),
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

/** One node in a run's span waterfall. */
export const SpanRecordSchema = z.object({
  spanId: z.string().min(1),
  parentId: z.string().min(1).optional(),
  name: z.string().min(1),
  kind: SpanKindSchema,
  status: LifecycleStatusSchema,
  startedAt: z.number().int().nonnegative(),
  endedAt: z.number().int().nonnegative().optional(),
  durationMs: z.number().nonnegative().optional(),
  /** Tool name for `tool` spans. */
  tool: z.string().optional(),
  /** Model + usage for `llm` spans. */
  model: z.string().optional(),
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  costUsd: z.number().nonnegative().optional(),
  error: z.string().optional(),
});
export type SpanRecord = z.infer<typeof SpanRecordSchema>;

/** A single run with its full span tree (the waterfall drawer). */
export const RunDetailSchema = RunSummarySchema.extend({
  input: z.string().optional(),
  spans: z.array(SpanRecordSchema),
});
export type RunDetail = z.infer<typeof RunDetailSchema>;

/**
 * Rolling aggregates over a bounded time window. One snapshot is emitted per
 * tick (default 1/sec); the dashboard keeps a sliding array for the charts.
 */
export const MetricsSnapshotSchema = z.object({
  /** Epoch ms this snapshot was computed. */
  ts: z.number().int().nonnegative(),
  activeRuns: z.number().int().nonnegative(),
  /** Completed runs per minute over the window. */
  throughputPerMin: z.number().nonnegative(),
  p50LatencyMs: z.number().nonnegative(),
  p95LatencyMs: z.number().nonnegative(),
  /** Share of completed runs that errored, in [0, 1]. */
  errorRate: z.number().min(0).max(1),
  /** Events ingested per second over the window. */
  eventsPerSec: z.number().nonnegative(),
  totalRuns: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  totalCostUsd: z.number().nonnegative(),
});
export type MetricsSnapshot = z.infer<typeof MetricsSnapshotSchema>;
