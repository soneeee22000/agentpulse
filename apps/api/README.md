# @pulse/api — AgentPulse backend

Fastify + TypeScript backend for the AgentPulse observability pipeline. It
ingests agent events, fans them out over an `EventBus`, projects them into live
runs and rolling metrics, and streams everything to the dashboard over SSE and
GraphQL subscriptions.

## Responsibilities

- **Ingest** — `POST /api/events` or the `ingest` mutation, Zod-validated, published to the bus.
- **EventBus** — `InMemoryBus` (default), `PubSubBus` (GCP), or `KafkaBus`, chosen by `BUS_DRIVER`.
- **Projector** — the single bus subscriber; folds events into the store,
  aggregator, and SSE fan-out.
- **RunStore** — runs + span trees with a bounded ring buffer.
- **Aggregator** — rolling throughput, p50/p95 latency, error rate, token/cost.
- **GraphQL** — a typed façade over the same read model, with a live subscription.
- **Simulator** — realistic synthetic traffic, in-process and as `npm run sim`.

## Routes

| Method | Route                              | Purpose                                        |
| ------ | ---------------------------------- | ---------------------------------------------- |
| `GET`  | `/api/health`                      | Status + bus driver + sim state                |
| `POST` | `/api/events`                      | Ingest a batch of events                       |
| `GET`  | `/api/stream`                      | SSE: snapshot + live deltas + metric ticks     |
| `GET`  | `/api/runs` · `/api/runs/:id`      | Runs feed + per-run span waterfall             |
| `GET`  | `/api/metrics`                     | Current rolling aggregates                     |
| `POST` | `/api/sim/start` · `/api/sim/stop` | Toggle synthetic traffic                       |
| `POST` | `/graphql`                         | GraphQL queries + mutations                    |
| `WS`   | `/graphql`                         | GraphQL subscriptions (`graphql-transport-ws`) |
| `GET`  | `/graphiql`                        | GraphiQL explorer (`GRAPHIQL=true`)            |

## GraphQL

REST and GraphQL are two façades over one `AppContext`. Neither owns state, so
`POST /api/events` and the `ingest` mutation reach the same bus through the same
Zod schema — the two ingest paths cannot drift.

```graphql
query Dashboard {
  health {
    busDriver
    activeRuns
  }
  runs(limit: 10, status: error) {
    total
    runs {
      runId
      workflow
      durationMs
      spans {
        spanId
        kind
        status
      }
    }
  }
}

subscription Live {
  agentEvents(runId: "run-42") {
    __typename
    ts
    ... on ToolCalled {
      tool
      args
    }
    ... on RunEnded {
      status
      durationMs
    }
  }
}
```

Two modelling decisions carry most of the weight:

- **`Run.spans` is a field resolver.** Listing runs never loads span trees; a
  client pays for them only on the runs it opens. The list view and the
  waterfall drawer share one query shape.
- **`AgentEvent` is an interface.** The seven event types are real GraphQL types
  resolved from the `type` discriminant, so the schema — not a comment —
  documents the wire protocol, and clients select exactly what their fragments
  declare.

The subscription is fed by the same `SseHub` that drives `/api/stream`, so there
is no second delivery path to keep in sync.

## Event bus

One interface, three interchangeable transports. Nothing downstream of the bus
knows which is in use.

| Driver  | `BUS_DRIVER` | Notes                                                      |
| ------- | ------------ | ---------------------------------------------------------- |
| Memory  | `memory`     | Default. Zero setup, fully offline, used in CI.            |
| Pub/Sub | `pubsub`     | GCP. Topic + subscription must already exist.              |
| Kafka   | `kafka`      | Keyed by `runId`; at-least-once; `--profile kafka` to run. |

`KafkaBus` keys every message by `runId`, so all events for a run land on one
partition and are consumed in publish order. Offsets auto-commit after the
handler resolves, making delivery at-least-once; `RunStore.apply` is a fold over
a keyed map, so replaying an event converges to the same state.

```bash
docker compose --profile kafka up --build   # broker on localhost:9092
BUS_DRIVER=kafka npm run dev:api
```

> On Node 20+ `kafkajs` emits a cosmetic `TimeoutNegativeWarning` from its
> internal `RequestQueue`. It originates in the driver, not this codebase, and
> does not affect delivery.

## Develop

```bash
npm run dev:api             # tsx watch, http://localhost:8080
npm run test --workspace @pulse/api
npm run smoke:subscription  # asserts the WS subscription streams live events
```

See [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) for the design.
