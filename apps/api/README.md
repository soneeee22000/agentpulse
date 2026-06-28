# @pulse/api — AgentPulse backend

Fastify + TypeScript backend for the AgentPulse observability pipeline. It
ingests agent events, fans them out over an `EventBus`, projects them into live
runs and rolling metrics, and streams everything to the dashboard over SSE.

## Responsibilities

- **Ingest** — `POST /api/events`, Zod-validated, published to the bus.
- **EventBus** — `InMemoryBus` (default) or `PubSubBus` (GCP), chosen by `BUS_DRIVER`.
- **Projector** — the single bus subscriber; folds events into the store,
  aggregator, and SSE fan-out.
- **RunStore** — runs + span trees with a bounded ring buffer.
- **Aggregator** — rolling throughput, p50/p95 latency, error rate, token/cost.
- **Simulator** — realistic synthetic traffic, in-process and as `npm run sim`.

## Routes

| Method | Route                              | Purpose                                    |
| ------ | ---------------------------------- | ------------------------------------------ |
| `GET`  | `/api/health`                      | Status + bus driver + sim state            |
| `POST` | `/api/events`                      | Ingest a batch of events                   |
| `GET`  | `/api/stream`                      | SSE: snapshot + live deltas + metric ticks |
| `GET`  | `/api/runs` · `/api/runs/:id`      | Runs feed + per-run span waterfall         |
| `GET`  | `/api/metrics`                     | Current rolling aggregates                 |
| `POST` | `/api/sim/start` · `/api/sim/stop` | Toggle synthetic traffic                   |

## Develop

```bash
npm run dev:api          # tsx watch, http://localhost:8080
npm run test --workspace @pulse/api
```

See [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) for the design.
