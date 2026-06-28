import type { AgentEvent, MetricsSnapshot, RunSummary } from '@pulse/shared';
import type { Config } from './config.js';
import { createBus, type EventBus } from './bus/index.js';
import { Aggregator } from './metrics/aggregator.js';
import { RunStore } from './store/runStore.js';
import { SseHub } from './sse/hub.js';
import { Simulator } from './sim/simulator.js';

const METRIC_TICK_MS = 1000;
const SNAPSHOT_RUN_LIMIT = 50;
/** Metric ticks retained to hydrate a newly connected dashboard's charts. */
const HISTORY_CAP = 90;

/**
 * The event-driven pipeline, assembled.
 *
 * `ingest → bus → projector → (store + aggregator + SSE)` plus a 1Hz metric
 * tick. The projector is the single bus subscriber: it folds every event into
 * the read model, the aggregator, and the live feed. Producers (HTTP ingest,
 * simulator) only ever touch {@link ingest}; they never see the store or hub.
 */
export class AppContext {
  readonly bus: EventBus;
  readonly store = new RunStore();
  readonly aggregator = new Aggregator();
  readonly sse = new SseHub();
  readonly simulator: Simulator;

  private tick: ReturnType<typeof setInterval> | null = null;
  private readonly history: MetricsSnapshot[] = [];

  constructor(readonly config: Config) {
    this.bus = createBus(config);
    this.simulator = new Simulator((event) => this.ingest(event));
    this.bus.subscribe((event) => this.project(event));
  }

  /** Publish one event onto the bus (the only producer-facing entry point). */
  async ingest(event: AgentEvent): Promise<void> {
    await this.bus.publish(event);
  }

  /** Start the metric ticker and (optionally) the simulator. */
  start(now: () => number = Date.now): void {
    if (this.tick) return;
    this.tick = setInterval(() => {
      const metrics = this.metrics(now());
      this.history.push(metrics);
      if (this.history.length > HISTORY_CAP) {
        this.history.splice(0, this.history.length - HISTORY_CAP);
      }
      this.sse.broadcast({ type: 'metrics', metrics });
    }, METRIC_TICK_MS);
    this.tick.unref?.();
    if (this.config.SIM_AUTOSTART) this.simulator.start();
  }

  async stop(): Promise<void> {
    if (this.tick) {
      clearInterval(this.tick);
      this.tick = null;
    }
    this.simulator.stop();
    await this.bus.close();
  }

  /** Current rolling metrics. */
  metrics(now: number = Date.now()): MetricsSnapshot {
    return this.aggregator.snapshot(now, this.store.activeRuns);
  }

  /** Hydration payload sent to a dashboard the moment it connects. */
  snapshot(now: number = Date.now()): {
    metrics: MetricsSnapshot;
    history: MetricsSnapshot[];
    runs: RunSummary[];
  } {
    const metrics = this.metrics(now);
    return {
      metrics,
      history: this.history.length > 0 ? [...this.history] : [metrics],
      runs: this.store.listRuns(SNAPSHOT_RUN_LIMIT),
    };
  }

  /** The lone bus subscriber: fan an event into every read model. */
  private project(event: AgentEvent): void {
    const summary = this.store.apply(event);
    this.aggregator.record(event);
    this.sse.broadcast({ type: 'event', event });
    if (summary) this.sse.broadcast({ type: 'run', run: summary });
  }
}
