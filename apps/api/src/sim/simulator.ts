import type { AgentEvent, SpanKind } from '@pulse/shared';

/** Sink the simulator publishes generated events to (the bus, via context). */
export type EmitFn = (event: AgentEvent) => void | Promise<void>;

interface ModelProfile {
  name: string;
  /** USD per 1K prompt / completion tokens. */
  inPerK: number;
  outPerK: number;
}

interface PhaseSpec {
  kind: SpanKind;
  name: string;
  durationMs: number;
  tool?: string;
  model?: ModelProfile;
  errors: boolean;
  spanId?: string;
  parentId?: string;
}

interface RunContext {
  runId: string;
  workflow: string;
  startedAt: number;
  phases: PhaseSpec[];
  totalTokens: number;
  totalCostUsd: number;
}

const WORKFLOWS = [
  'rag-pipeline',
  'support-agent',
  'research-agent',
  'code-reviewer',
  'data-extractor',
];

const MODELS: ModelProfile[] = [
  { name: 'claude-sonnet-4-6', inPerK: 0.003, outPerK: 0.015 },
  { name: 'claude-haiku-4-5', inPerK: 0.0008, outPerK: 0.004 },
  { name: 'gpt-4o', inPerK: 0.0025, outPerK: 0.01 },
  { name: 'mistral-large', inPerK: 0.002, outPerK: 0.006 },
];

const TOOLS = ['vector_search', 'web_search', 'sql_query', 'graph_lookup', 'http_fetch'];

const ERROR_RATE = 0.06;
const MIN_SPAWN_MS = 700;
const MAX_SPAWN_MS = 2200;
const INITIAL_BURST = 4;

/**
 * Synthetic traffic generator. Emits realistic agent runs in real time so the
 * dashboard is alive offline with zero keys: span trees with believable
 * latency spread, per-model token/cost, occasional tool calls, and a ~6% error
 * rate. Each run schedules its own timers, so many runs overlap naturally.
 */
export class Simulator {
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private seq = 0;
  private active = false;

  constructor(
    private readonly emit: EmitFn,
    private readonly now: () => number = Date.now,
  ) {}

  get running(): boolean {
    return this.active;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    for (let i = 0; i < INITIAL_BURST; i += 1) {
      this.schedule(randInt(0, 1500), () => this.spawnRun());
    }
    this.scheduleNextSpawn();
  }

  stop(): void {
    this.active = false;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  // ── internals ─────────────────────────────────────────────────────

  private scheduleNextSpawn(): void {
    this.schedule(randInt(MIN_SPAWN_MS, MAX_SPAWN_MS), () => {
      this.spawnRun();
      this.scheduleNextSpawn();
    });
  }

  private spawnRun(): void {
    if (!this.active) return;
    this.seq += 1;
    const runId = `run-${this.now().toString(36)}-${this.seq}`;
    const ctx: RunContext = {
      runId,
      workflow: pick(WORKFLOWS),
      startedAt: this.now(),
      phases: assignSpanTree(runId, buildPhases()),
      totalTokens: 0,
      totalCostUsd: 0,
    };
    this.send({
      type: 'run.started',
      runId,
      ts: ctx.startedAt,
      workflow: ctx.workflow,
      input: 'simulated request',
    });
    this.runPhase(ctx, 0);
  }

  private runPhase(ctx: RunContext, index: number): void {
    if (!this.active) return;
    const phase = ctx.phases[index];
    if (!phase) {
      this.endRun(ctx, 'ok');
      return;
    }

    const spanId = phase.spanId ?? `${ctx.runId}-s${index}`;
    this.send({
      type: 'span.started',
      runId: ctx.runId,
      ts: this.now(),
      spanId,
      ...(phase.parentId ? { parentId: phase.parentId } : {}),
      name: phase.name,
      kind: phase.kind,
    });

    if (phase.tool) {
      this.send({
        type: 'tool.called',
        runId: ctx.runId,
        ts: this.now(),
        spanId,
        tool: phase.tool,
        args: { query: 'simulated' },
      });
    }

    if (phase.model) {
      const promptTokens = randInt(200, 2200);
      const completionTokens = randInt(60, 900);
      const costUsd =
        (promptTokens / 1000) * phase.model.inPerK +
        (completionTokens / 1000) * phase.model.outPerK;
      ctx.totalTokens += promptTokens + completionTokens;
      ctx.totalCostUsd += costUsd;
      this.send({
        type: 'llm.usage',
        runId: ctx.runId,
        ts: this.now(),
        spanId,
        model: phase.model.name,
        promptTokens,
        completionTokens,
        costUsd: round(costUsd, 6),
      });
    }

    this.schedule(phase.durationMs, () => {
      this.send({
        type: 'span.ended',
        runId: ctx.runId,
        ts: this.now(),
        spanId,
        status: phase.errors ? 'error' : 'ok',
        ...(phase.errors ? { error: `${phase.kind} step failed: upstream timeout` } : {}),
      });
      if (phase.errors) {
        this.endRun(ctx, 'error');
        return;
      }
      this.runPhase(ctx, index + 1);
    });
  }

  private endRun(ctx: RunContext, status: 'ok' | 'error'): void {
    this.send({
      type: 'run.ended',
      runId: ctx.runId,
      ts: this.now(),
      status,
      durationMs: Math.max(1, this.now() - ctx.startedAt),
      totalTokens: ctx.totalTokens,
      totalCostUsd: round(ctx.totalCostUsd, 6),
    });
  }

  private send(event: AgentEvent): void {
    void this.emit(event);
  }

  private schedule(ms: number, fn: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, ms);
    this.timers.add(timer);
  }
}

/**
 * Link phases into a real span tree: plan is the root; retrieve and llm are its
 * children; a tool nests under retrieve; synthesize nests under llm.
 */
function assignSpanTree(runId: string, phases: PhaseSpec[]): PhaseSpec[] {
  const idByKind: Partial<Record<SpanKind, string>> = {};
  return phases.map((phase, index) => {
    const spanId = `${runId}-s${index}`;
    let parentId: string | undefined;
    switch (phase.kind) {
      case 'plan':
        break;
      case 'retrieve':
      case 'llm':
        parentId = idByKind.plan;
        break;
      case 'tool':
        parentId = idByKind.retrieve ?? idByKind.plan;
        break;
      case 'synthesize':
        parentId = idByKind.llm ?? idByKind.plan;
        break;
    }
    idByKind[phase.kind] = spanId;
    return { ...phase, spanId, ...(parentId ? { parentId } : {}) };
  });
}

/** Build a believable phase plan, injecting at most one error. */
function buildPhases(): PhaseSpec[] {
  const phases: Omit<PhaseSpec, 'errors'>[] = [
    { kind: 'plan', name: 'Plan approach', durationMs: randInt(120, 400), model: smallModel() },
    {
      kind: 'retrieve',
      name: 'Retrieve context',
      durationMs: randInt(80, 320),
      tool: 'vector_search',
    },
  ];

  if (Math.random() < 0.6) {
    const tool = pick(TOOLS);
    phases.push({ kind: 'tool', name: `Call ${tool}`, durationMs: randInt(120, 600), tool });
  }

  phases.push(
    { kind: 'llm', name: 'Generate answer', durationMs: randInt(350, 1400), model: pick(MODELS) },
    {
      kind: 'synthesize',
      name: 'Synthesize + cite',
      durationMs: randInt(120, 360),
      model: smallModel(),
    },
  );

  const errorIndex = Math.random() < ERROR_RATE ? randInt(0, phases.length - 1) : -1;
  return phases.map((p, i) => ({ ...p, errors: i === errorIndex }));
}

function smallModel(): ModelProfile {
  return MODELS[1]!; // haiku-class, cheap planning/synthesis
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
