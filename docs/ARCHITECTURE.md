# Architecture

AgentPulse is a small, deliberately-layered **event-driven** system. This note
explains the moving parts and the decisions behind them.

## The pipeline

```
producer → ingest → EventBus → projector → { RunStore, Aggregator, SseHub } → dashboard
```

1. **Producers** emit `AgentEvent`s — the in-process `Simulator`, the standalone
   `npm run sim` load generator, or any agent that POSTs to `/api/events`.
2. **Ingest** (`POST /api/events`) validates each event against the shared Zod
   taxonomy and publishes it to the bus.
3. **EventBus** fans events out to subscribers. One interface, two adapters
   (see below).
4. The **projector** (the single bus subscriber, in `AppContext`) folds every
   event into three read models at once.
5. The **SSE hub** streams snapshot + live deltas + 1Hz metric ticks to every
   connected dashboard.

## The EventBus seam

```ts
interface EventBus {
  readonly driver: 'memory' | 'pubsub';
  publish(event: AgentEvent): Promise<void>;
  subscribe(handler: EventHandler): void;
  close(): Promise<void>;
}
```

- **`InMemoryBus`** — synchronous in-process fan-out; zero dependencies, fully
  offline. The default, and what CI and the demo run on.
- **`PubSubBus`** — publishes to a Google Cloud Pub/Sub topic; events round-trip
  through GCP and arrive back via the subscription. This is the genuine
  event-driven decoupling (multiple instances, durable transport) that the
  in-memory bus only approximates.

`createBus(config)` picks the adapter from `BUS_DRIVER`. **Nothing downstream of
the bus knows which transport is active** — the projector, store, aggregator, SSE
hub, and the entire frontend are identical in both modes. That seam is the whole
point: it's how you move from a laptop to a fleet without rewriting the app.

> Honesty note: the Pub/Sub adapter is real, reviewable code. It is **not
> deployed** — the live demo runs the in-memory bus. The claim is "GCP-ready
> event-driven architecture," not "running on GCP."

## Read models

The projector maintains three independent projections so each can be optimized
for its job:

- **`RunStore`** — folds events into runs and span trees, bounded by a ring
  buffer (oldest run evicted past the cap, lifetime counters keep counting).
  Serves the runs feed and the per-run span waterfall.
- **`Aggregator`** — a rolling time window (default 60s) over completed runs:
  throughput/min, p50/p95 latency (linear-interpolation percentile over the
  window), error rate, events/sec, plus cumulative tokens and cost. Pruned
  lazily against a caller-supplied `now`, so the math is deterministic and unit
  tested without faking timers.
- **`SseHub`** — a transport-agnostic set of subscribers; the HTTP route adapts a
  hijacked SSE socket into a client.

## Streaming protocol

`/api/stream` is a GET, so the browser's native `EventSource` is used (free
reconnect-with-backoff). On connect, the server sends a `snapshot` (current
metrics + recent metric history to hydrate the charts + recent runs). After that
it pushes `metrics` (1/sec), `run` (per-run deltas), and `event` messages. Every
frame is a member of the `StreamMessage` discriminated union and is re-validated
in the browser before it can reach the store.

The SSE write path **hijacks** the Fastify reply to own the raw socket; because
that bypasses the `@fastify/cors` hook, the route re-applies the CORS origin
header itself.

## Why Zod contracts in a shared package

`@pulse/shared` is the single source of truth for the event taxonomy and the API
shapes. The producer, the aggregator, the SSE serializer, and the Vue store all
import the same schemas and inferred types — the protocol cannot drift between
the side that emits an event and the side that renders it.

## Testing strategy

- **Aggregator** — percentile math against known inputs; window eviction;
  throughput and error-rate derivation.
- **Bus** — fan-out, throwing-subscriber isolation, close semantics.
- **RunStore** — full-run projection, span waterfall durations, active-run
  counting, ring-buffer eviction, status filtering.
- **Frontend** — formatters and the span-waterfall component (track positioning,
  metadata, error surfacing).
