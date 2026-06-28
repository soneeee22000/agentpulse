import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  IngestRequestSchema,
  LifecycleStatusSchema,
  toSseFrame,
  type ApiError,
  type HealthResponse,
  type IngestResponse,
  type MetricsSnapshot,
  type RunDetail,
  type RunListResponse,
  type SimState,
  type StreamMessage,
} from '@pulse/shared';
import { z } from 'zod';
import type { AppContext } from '../context.js';

const SSE_HEARTBEAT_MS = 25_000;

const RunQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: LifecycleStatusSchema.optional(),
});

function apiError(code: string, message: string): ApiError {
  return { error: { code, message } };
}

/**
 * Prepare a Fastify reply for SSE. We hijack the raw socket (bypassing the
 * `@fastify/cors` onSend hook), so we re-apply the CORS origin header here.
 */
function startSse(request: FastifyRequest, reply: FastifyReply): void {
  reply.hijack();
  const origin = (request.headers.origin as string | undefined) ?? '*';
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
  });
}

function writeSse(reply: FastifyReply, payload: unknown): void {
  reply.raw.write(toSseFrame(payload));
  const flush = (reply.raw as unknown as { flush?: () => void }).flush;
  if (typeof flush === 'function') flush.call(reply.raw);
}

/** Register all `/api` routes against the shared app context. */
export function registerRoutes(app: FastifyInstance, ctx: AppContext): void {
  // GET /api/health ----------------------------------------------------
  app.get('/api/health', async (): Promise<HealthResponse> => {
    return {
      status: 'ok',
      busDriver: ctx.bus.driver,
      activeRuns: ctx.store.activeRuns,
      totalRuns: ctx.store.totalRuns,
      simRunning: ctx.simulator.running,
    };
  });

  // GET /api/metrics ---------------------------------------------------
  app.get('/api/metrics', async (): Promise<MetricsSnapshot> => ctx.metrics());

  // GET /api/runs ------------------------------------------------------
  app.get('/api/runs', async (request, reply) => {
    const parsed = RunQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400).send(apiError('invalid_query', parsed.error.message));
      return;
    }
    const runs = ctx.store.listRuns(parsed.data.limit, parsed.data.status);
    const response: RunListResponse = { runs, total: ctx.store.totalRuns };
    return response;
  });

  // GET /api/runs/:id --------------------------------------------------
  app.get('/api/runs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const detail: RunDetail | undefined = ctx.store.getRun(id);
    if (!detail) {
      reply.code(404).send(apiError('not_found', `run ${id} not found`));
      return;
    }
    return detail;
  });

  // POST /api/events ---------------------------------------------------
  app.post('/api/events', async (request, reply) => {
    const parsed = IngestRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send(apiError('invalid_request', parsed.error.message));
      return;
    }
    for (const event of parsed.data.events) {
      await ctx.ingest(event);
    }
    const response: IngestResponse = { accepted: parsed.data.events.length };
    return response;
  });

  // POST /api/sim/start | /api/sim/stop --------------------------------
  app.post('/api/sim/start', async (): Promise<SimState> => {
    ctx.simulator.start();
    return { running: ctx.simulator.running };
  });
  app.post('/api/sim/stop', async (): Promise<SimState> => {
    ctx.simulator.stop();
    return { running: ctx.simulator.running };
  });

  // GET /api/stream (SSE) ----------------------------------------------
  app.get('/api/stream', async (request, reply) => {
    startSse(request, reply);

    // Hydrate the dashboard immediately.
    const { metrics, history, runs } = ctx.snapshot();
    writeSse(reply, { type: 'snapshot', metrics, history, runs } satisfies StreamMessage);

    const unsubscribe = ctx.sse.add((message) => writeSse(reply, message));
    const heartbeat = setInterval(() => reply.raw.write(': ping\n\n'), SSE_HEARTBEAT_MS);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      reply.raw.end();
    });
  });
}
