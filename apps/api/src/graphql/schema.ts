/**
 * The AgentPulse GraphQL schema.
 *
 * A typed, single-round-trip view over the same read model the REST routes
 * serve — plus a live `agentEvents` subscription fed by the event bus.
 *
 * Two modelling decisions worth naming:
 *
 * - **`Run.spans` is a field resolver, not a column.** Listing runs never pays
 *   for span trees; a client asks for `spans` only on the runs it opens. This
 *   is the whole reason the dashboard's list view and its waterfall drawer can
 *   share one query shape.
 * - **`AgentEvent` is an interface, not a blob.** The seven event types are
 *   real GraphQL types resolved from the `type` discriminant, so a client
 *   selects exactly the fields its fragment declares and the schema — rather
 *   than a comment — documents the wire protocol.
 *
 * Epoch-millisecond timestamps and durations are `Float`, not `Int`: GraphQL's
 * `Int` is a signed 32-bit integer and `Date.now()` overflowed it in 1970.
 */
export const typeDefs = /* GraphQL */ `
  scalar JSON

  enum BusDriver {
    memory
    pubsub
    kafka
  }

  enum LifecycleStatus {
    running
    ok
    error
  }

  enum FinishStatus {
    ok
    error
  }

  enum SpanKind {
    plan
    retrieve
    tool
    llm
    synthesize
  }

  enum LogLevel {
    debug
    info
    warn
    error
  }

  type Health {
    status: String!
    busDriver: BusDriver!
    activeRuns: Int!
    totalRuns: Int!
    simRunning: Boolean!
  }

  type Metrics {
    ts: Float!
    activeRuns: Int!
    throughputPerMin: Float!
    p50LatencyMs: Float!
    p95LatencyMs: Float!
    errorRate: Float!
    eventsPerSec: Float!
    totalRuns: Int!
    totalTokens: Int!
    totalCostUsd: Float!
  }

  type Span {
    spanId: ID!
    parentId: ID
    name: String!
    kind: SpanKind!
    status: LifecycleStatus!
    startedAt: Float!
    endedAt: Float
    durationMs: Float
    tool: String
    model: String
    promptTokens: Int
    completionTokens: Int
    costUsd: Float
    error: String
  }

  type Run {
    runId: ID!
    workflow: String!
    status: LifecycleStatus!
    startedAt: Float!
    durationMs: Float
    spanCount: Int!
    errorCount: Int!
    totalTokens: Int!
    totalCostUsd: Float!
    "Resolved on demand — listing runs does not load their inputs."
    input: String
    "Resolved on demand — listing runs does not load their span trees."
    spans: [Span!]!
  }

  type RunConnection {
    runs: [Run!]!
    total: Int!
  }

  interface AgentEvent {
    runId: ID!
    ts: Float!
  }

  type RunStarted implements AgentEvent {
    runId: ID!
    ts: Float!
    workflow: String!
    input: String
  }

  type SpanStarted implements AgentEvent {
    runId: ID!
    ts: Float!
    spanId: ID!
    parentId: ID
    name: String!
    kind: SpanKind!
  }

  type ToolCalled implements AgentEvent {
    runId: ID!
    ts: Float!
    spanId: ID!
    tool: String!
    args: JSON!
  }

  type LlmUsage implements AgentEvent {
    runId: ID!
    ts: Float!
    spanId: ID!
    model: String!
    promptTokens: Int!
    completionTokens: Int!
    costUsd: Float!
  }

  type SpanEnded implements AgentEvent {
    runId: ID!
    ts: Float!
    spanId: ID!
    status: FinishStatus!
    error: String
  }

  type RunEnded implements AgentEvent {
    runId: ID!
    ts: Float!
    status: FinishStatus!
    durationMs: Float!
    totalTokens: Int!
    totalCostUsd: Float!
  }

  type LogLine implements AgentEvent {
    runId: ID!
    ts: Float!
    spanId: ID
    level: LogLevel!
    message: String!
  }

  type IngestResult {
    accepted: Int!
  }

  type SimState {
    running: Boolean!
  }

  type Query {
    health: Health!
    metrics: Metrics!
    runs(limit: Int = 50, status: LifecycleStatus): RunConnection!
    run(runId: ID!): Run
  }

  type Mutation {
    "Publish a batch of agent events onto the bus. Validated with the same zod schema as POST /api/events."
    ingest(events: [JSON!]!): IngestResult!
    startSimulator: SimState!
    stopSimulator: SimState!
  }

  type Subscription {
    "Live event feed, optionally narrowed to a single run."
    agentEvents(runId: ID): AgentEvent!
  }
`;
