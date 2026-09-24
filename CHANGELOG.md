# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and entries are grouped from
conventional commits.

## [Unreleased]

### Documentation

- Rewrite the README around what the project does and does not do: a Limitations section
  (observes runs, does not orchestrate them; simulated traffic; cold starts; in-memory
  state; no auth), a verified Results section and a single live host.
- Add `docs/WHY.md` with the problem statement and a "what this is not" list.
- Bring `docs/ARCHITECTURE.md` up to date with the Kafka driver and the Cloud Run demo.
- Correct the Kafka replay note: the projector is not idempotent, so a redelivered event
  is counted twice.

## [0.1.0] - 2026-07-09

### Features

- Expose a GraphQL API (Mercurius) with queries, mutations and live subscriptions.
- Add a Kafka event-bus driver alongside the in-memory and Pub/Sub drivers.
- Real span trees in the simulator, a Pub/Sub bus test and nested waterfall rendering.
- Initial release: event-driven observability dashboard for agent runs, with Zod
  contracts, an in-memory and Pub/Sub event bus, rolling metrics, SSE streaming and a
  Vue 3 dashboard.

### Fixes

- Repair the Docker image builds so the containers run.

### Documentation

- Link the Cloud Run dashboard and the GraphiQL explorer.
