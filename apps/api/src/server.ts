import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { config, type Config } from './config.js';
import { AppContext } from './context.js';
import { registerRoutes } from './routes/index.js';

export interface BuildServerOptions {
  config?: Config;
  /** Inject a pre-built context (used by tests); otherwise constructed from config. */
  context?: AppContext;
}

/**
 * Build the Fastify app: CORS, the event-driven pipeline (bus → projector →
 * store/aggregator/SSE), and routes. The metric ticker and optional simulator
 * are started here so the dashboard is live the moment the server is up.
 */
export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const cfg = options.config ?? config;
  const ctx = options.context ?? new AppContext(cfg);

  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin: cfg.CORS_ORIGIN === '*' ? true : cfg.CORS_ORIGIN.split(',').map((s) => s.trim()),
  });

  registerRoutes(app, ctx);
  ctx.start();

  app.decorate('appContext', ctx);
  app.addHook('onClose', async () => {
    await ctx.stop();
  });

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    appContext: AppContext;
  }
}
