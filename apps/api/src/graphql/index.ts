import type { FastifyInstance } from 'fastify';
import mercurius from 'mercurius';
import type { AppContext } from '../context.js';
import { createResolvers } from './resolvers.js';
import { typeDefs } from './schema.js';

export { typeDefs } from './schema.js';
export { createResolvers } from './resolvers.js';
export { subscribeToEvents } from './eventStream.js';

export interface GraphqlOptions {
  /** Serve the GraphiQL explorer at `/graphiql`. */
  graphiql: boolean;
}

/**
 * Mount the GraphQL endpoint at `/graphql`, with subscriptions over WebSocket.
 *
 * REST and GraphQL are two façades over one {@link AppContext}: neither owns
 * state, so `POST /api/events` and the `ingest` mutation reach the same bus and
 * the same zod validation.
 */
export async function registerGraphql(
  app: FastifyInstance,
  ctx: AppContext,
  options: GraphqlOptions,
): Promise<void> {
  await app.register(mercurius, {
    schema: typeDefs,
    resolvers: createResolvers(ctx),
    graphiql: options.graphiql,
    subscription: true,
  });
}
