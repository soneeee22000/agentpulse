import type { AgentEvent, LifecycleStatus, RunDetail, RunSummary, SpanRecord } from '@pulse/shared';

interface RunState {
  runId: string;
  workflow: string;
  status: LifecycleStatus;
  startedAt: number;
  durationMs?: number;
  input?: string;
  errorCount: number;
  totalTokens: number;
  totalCostUsd: number;
  /** Insertion order preserved for the waterfall. */
  spans: Map<string, SpanRecord>;
}

/** Newest run that exceeds this cap evicts the oldest; surfaced in README. */
const DEFAULT_MAX_RUNS = 200;

/**
 * In-memory projection of the event stream into queryable runs and spans.
 *
 * Bounded by a ring buffer: only the most recent `maxRuns` runs are retained
 * (oldest evicted first), so memory stays flat under sustained traffic.
 * Lifetime counters (`totalRuns`) keep counting past evictions.
 */
export class RunStore {
  private readonly runs = new Map<string, RunState>();
  private readonly maxRuns: number;
  private totalRunsCreated = 0;

  constructor(maxRuns: number = DEFAULT_MAX_RUNS) {
    this.maxRuns = maxRuns;
  }

  /**
   * Apply an event to the read model. Returns the affected run's summary so the
   * caller can broadcast the delta, or `null` if the event referenced no
   * known run.
   */
  apply(event: AgentEvent): RunSummary | null {
    switch (event.type) {
      case 'run.started':
        return this.onRunStarted(event);
      case 'span.started':
        return this.onSpanStarted(event);
      case 'tool.called':
        return this.patchSpan(event.runId, event.spanId, (s) => {
          s.tool = event.tool;
        });
      case 'llm.usage':
        return this.onLlmUsage(event);
      case 'span.ended':
        return this.onSpanEnded(event);
      case 'run.ended':
        return this.onRunEnded(event);
      case 'log':
        return this.summaryOf(event.runId);
    }
  }

  listRuns(limit = 50, status?: LifecycleStatus): RunSummary[] {
    const all = [...this.runs.values()]
      .filter((r) => (status ? r.status === status : true))
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
    return all.map(toSummary);
  }

  getRun(runId: string): RunDetail | undefined {
    const run = this.runs.get(runId);
    if (!run) return undefined;
    return {
      ...toSummary(run),
      ...(run.input !== undefined ? { input: run.input } : {}),
      spans: [...run.spans.values()],
    };
  }

  get activeRuns(): number {
    let n = 0;
    for (const r of this.runs.values()) if (r.status === 'running') n += 1;
    return n;
  }

  get totalRuns(): number {
    return this.totalRunsCreated;
  }

  // ── event handlers ────────────────────────────────────────────────

  private onRunStarted(event: Extract<AgentEvent, { type: 'run.started' }>): RunSummary {
    const state: RunState = {
      runId: event.runId,
      workflow: event.workflow,
      status: 'running',
      startedAt: event.ts,
      ...(event.input !== undefined ? { input: event.input } : {}),
      errorCount: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      spans: new Map(),
    };
    this.runs.set(event.runId, state);
    this.totalRunsCreated += 1;
    this.evictIfNeeded();
    return toSummary(state);
  }

  private onSpanStarted(event: Extract<AgentEvent, { type: 'span.started' }>): RunSummary | null {
    const run = this.runs.get(event.runId);
    if (!run) return null;
    run.spans.set(event.spanId, {
      spanId: event.spanId,
      ...(event.parentId !== undefined ? { parentId: event.parentId } : {}),
      name: event.name,
      kind: event.kind,
      status: 'running',
      startedAt: event.ts,
    });
    return toSummary(run);
  }

  private onLlmUsage(event: Extract<AgentEvent, { type: 'llm.usage' }>): RunSummary | null {
    const run = this.runs.get(event.runId);
    if (!run) return null;
    const span = run.spans.get(event.spanId);
    if (span) {
      span.model = event.model;
      span.promptTokens = event.promptTokens;
      span.completionTokens = event.completionTokens;
      span.costUsd = event.costUsd;
    }
    run.totalTokens += event.promptTokens + event.completionTokens;
    run.totalCostUsd += event.costUsd;
    return toSummary(run);
  }

  private onSpanEnded(event: Extract<AgentEvent, { type: 'span.ended' }>): RunSummary | null {
    const run = this.runs.get(event.runId);
    if (!run) return null;
    const span = run.spans.get(event.spanId);
    if (span) {
      span.status = event.status;
      span.endedAt = event.ts;
      span.durationMs = Math.max(0, event.ts - span.startedAt);
      if (event.error !== undefined) span.error = event.error;
    }
    if (event.status === 'error') run.errorCount += 1;
    return toSummary(run);
  }

  private onRunEnded(event: Extract<AgentEvent, { type: 'run.ended' }>): RunSummary | null {
    const run = this.runs.get(event.runId);
    if (!run) return null;
    run.status = event.status;
    run.durationMs = event.durationMs;
    run.totalTokens = event.totalTokens;
    run.totalCostUsd = event.totalCostUsd;
    return toSummary(run);
  }

  private patchSpan(
    runId: string,
    spanId: string,
    mutate: (span: SpanRecord) => void,
  ): RunSummary | null {
    const run = this.runs.get(runId);
    if (!run) return null;
    const span = run.spans.get(spanId);
    if (span) mutate(span);
    return toSummary(run);
  }

  private summaryOf(runId: string): RunSummary | null {
    const run = this.runs.get(runId);
    return run ? toSummary(run) : null;
  }

  private evictIfNeeded(): void {
    while (this.runs.size > this.maxRuns) {
      const oldest = this.runs.keys().next().value;
      if (oldest === undefined) break;
      this.runs.delete(oldest);
    }
  }
}

function toSummary(run: RunState): RunSummary {
  return {
    runId: run.runId,
    workflow: run.workflow,
    status: run.status,
    startedAt: run.startedAt,
    ...(run.durationMs !== undefined ? { durationMs: run.durationMs } : {}),
    spanCount: run.spans.size,
    errorCount: run.errorCount,
    totalTokens: run.totalTokens,
    totalCostUsd: run.totalCostUsd,
  };
}
