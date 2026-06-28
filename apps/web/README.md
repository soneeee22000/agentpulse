# @pulse/web — AgentPulse dashboard

A high-craft Vue 3 + TypeScript observability dashboard. It connects to the API
over SSE and renders live agent telemetry: stat cards, streaming time-series
charts, a runs feed, and an interactive span-waterfall drawer.

## Highlights

- **Streaming state** — a Pinia store folds the SSE stream; charts hydrate from
  the snapshot's metric history so they render a curve on first paint.
- **Charts** — `@unovis/vue` time series for throughput, p50/p95 latency, and
  event rate.
- **Runs feed** — live table with status pills, duration, spans, tokens, cost.
- **Span waterfall** — click a run to see its trace on a real timeline, with
  per-span model / tokens / cost and surfaced errors.
- **Design tokens** — a Tailwind v4 "control-room" dark theme; no raw colors.

## Develop

```bash
npm run dev:web          # vite, http://localhost:3000
npm run test --workspace @pulse/web
```

`VITE_API_URL` (default `http://localhost:8080`) points the dashboard at the API.
