import type { AgentEvent } from '@pulse/shared';
import type { SseHub } from '../sse/hub.js';

/**
 * Events buffered for a slow subscriber before the oldest is dropped.
 *
 * A GraphQL client that stops calling `next()` must not be able to grow the
 * process heap without bound. Dropping the oldest event is the right trade for
 * a live telemetry feed: a lagging dashboard wants recent truth, not a perfect
 * replay of history it can no longer render.
 */
const MAX_BUFFERED_EVENTS = 1000;

/**
 * Adapt the SSE fan-out hub into an async iterator for GraphQL subscriptions.
 *
 * The hub is already the single broadcast point for the projector, so the
 * `agentEvents` subscription and the `/api/stream` SSE endpoint observe exactly
 * the same events from exactly the same source. There is no second delivery
 * path to keep in sync.
 *
 * Unsubscribing from the hub happens on `return()`/`throw()`, which graphql-js
 * calls when the client disconnects or the subscription errors.
 */
export function subscribeToEvents(hub: SseHub, runId?: string): AsyncIterableIterator<AgentEvent> {
  const buffered: AgentEvent[] = [];
  const waiting: Array<(result: IteratorResult<AgentEvent>) => void> = [];
  let closed = false;

  const unsubscribe = hub.add((message) => {
    if (closed || message.type !== 'event') return;
    if (runId !== undefined && message.event.runId !== runId) return;

    const resolve = waiting.shift();
    if (resolve) {
      resolve({ value: message.event, done: false });
      return;
    }
    buffered.push(message.event);
    if (buffered.length > MAX_BUFFERED_EVENTS) buffered.shift();
  });

  const close = (): IteratorResult<AgentEvent> => {
    if (!closed) {
      closed = true;
      unsubscribe();
    }
    while (waiting.length > 0) waiting.shift()?.({ value: undefined, done: true });
    return { value: undefined, done: true };
  };

  return {
    [Symbol.asyncIterator]() {
      return this;
    },
    next(): Promise<IteratorResult<AgentEvent>> {
      const next = buffered.shift();
      if (next !== undefined) return Promise.resolve({ value: next, done: false });
      if (closed) return Promise.resolve({ value: undefined, done: true });
      return new Promise((resolve) => waiting.push(resolve));
    },
    return(): Promise<IteratorResult<AgentEvent>> {
      return Promise.resolve(close());
    },
    throw(error?: unknown): Promise<IteratorResult<AgentEvent>> {
      close();
      return Promise.reject(error);
    },
  };
}
