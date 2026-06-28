import type { AgentEvent, BusDriver } from '@pulse/shared';

/** A subscriber invoked once per delivered event. */
export type EventHandler = (event: AgentEvent) => void | Promise<void>;

/**
 * The event-driven core of AgentPulse.
 *
 * Producers (the ingest route, the simulator, a future agent SDK) publish
 * {@link AgentEvent}s; subscribers (the projector that builds the read model,
 * the SSE fan-out) consume them. The single interface has two interchangeable
 * implementations selected at boot by `BUS_DRIVER`:
 *
 * - {@link InMemoryBus} — in-process, zero setup, fully offline (default).
 * - `PubSubBus` — Google Cloud Pub/Sub; same contract, production transport.
 *
 * Nothing downstream of the bus knows or cares which transport is in use.
 */
export interface EventBus {
  readonly driver: BusDriver;
  /** Publish one event to all subscribers. */
  publish(event: AgentEvent): Promise<void>;
  /** Register a handler for every delivered event. */
  subscribe(handler: EventHandler): void;
  /** Release transport resources (connections, subscriptions). */
  close(): Promise<void>;
}
