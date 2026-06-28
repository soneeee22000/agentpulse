import type { AgentEvent } from '@pulse/shared';
import type { EventBus, EventHandler } from './eventBus.js';

/**
 * In-process event bus: synchronous fan-out to every subscriber, in
 * subscription order. A handler that throws is isolated so one bad subscriber
 * can't break delivery to the others or to the publisher.
 *
 * This is the default transport — the whole system runs with no external
 * dependencies, which keeps the dev loop and CI fully offline.
 */
export class InMemoryBus implements EventBus {
  readonly driver = 'memory' as const;
  private readonly handlers: EventHandler[] = [];

  subscribe(handler: EventHandler): void {
    this.handlers.push(handler);
  }

  async publish(event: AgentEvent): Promise<void> {
    for (const handler of this.handlers) {
      try {
        await handler(event);
      } catch (err) {
        console.error('[bus:memory] subscriber threw', err);
      }
    }
  }

  async close(): Promise<void> {
    this.handlers.length = 0;
  }
}
