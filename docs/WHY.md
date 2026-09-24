# Why AgentPulse exists

An agent run is not one request. It plans, retrieves, calls tools and calls one or more models, and each step can be slow, expensive or wrong on its own. When a run misbehaves, the useful question is which step did it and what that step cost. A final status code or an end-of-day log export does not answer that.

The cost of not knowing is practical. Latency and spend pile up in the steps nobody looks at, errors that one step swallows show up later as a bad answer, and a team debugging a live system ends up reading raw logs by hand. The signal has to arrive as the run happens, grouped by run and span, with tokens and cost next to the timing.

This matters to anyone running multi-step agents: the engineers who debug them and the people who pay for the model calls. AgentPulse shows one way to build that view as an event-driven service. A single event contract, a transport-agnostic bus, and read models projected from the event stream mean the same dashboard works on a laptop with no setup and on a durable log in the cloud.

## Layer, problem, answer

| Layer      | Problem                                                       | How AgentPulse answers it                                                                                     |
| ---------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Contract   | Producers and consumers of agent events drift apart.          | One Zod event taxonomy in `@pulse/shared`, validated at ingest and again in the browser.                      |
| Transport  | A local demo and a real deployment need different transports. | One `EventBus` interface with in-memory, Google Cloud Pub/Sub and Kafka drivers, chosen by `BUS_DRIVER`.      |
| Read model | Raw events are not answers.                                   | A projector folds events into runs with span trees and a rolling window of throughput, latency, errors, cost. |
| Delivery   | Polling dashboards are late.                                  | SSE with a hydrating snapshot, and GraphQL subscriptions fed by the same fan-out hub.                         |
| View       | A failed run hides the failing step.                          | A span waterfall per run: each step on a timeline with duration, model, tokens, cost and error.               |

## What this is not

- **Not a product.** It is a portfolio piece that shows the architecture end to end.
- **Not an orchestrator.** It runs no agents and controls none; it only receives the events they emit.
- **Not real traffic.** The live demo and the screenshots show events from the built-in simulator. The model names and prices in the simulator are illustrative.
- **Not an OpenTelemetry backend.** The events borrow OpenTelemetry's run/span vocabulary, but there is no OTLP ingest.
- **Not durable.** State is held in memory and is lost on restart. The Pub/Sub and Kafka drivers exist, but the deployed demo uses the in-memory bus.
- **Not secured.** There is no authentication; it is a public demo.
