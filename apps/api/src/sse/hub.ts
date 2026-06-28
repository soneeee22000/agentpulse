import type { StreamMessage } from '@pulse/shared';

/** A connected dashboard: a sink that receives serialized stream messages. */
export type SseClient = (message: StreamMessage) => void;

/**
 * Fan-out hub for the live dashboard feed. Transport-agnostic: the HTTP route
 * adapts a hijacked SSE socket into an {@link SseClient}; the hub just tracks
 * subscribers and broadcasts. A throwing client is dropped so one dead
 * connection can't stall the broadcast loop.
 */
export class SseHub {
  private readonly clients = new Set<SseClient>();

  /** Register a client; returns an unsubscribe function. */
  add(client: SseClient): () => void {
    this.clients.add(client);
    return () => {
      this.clients.delete(client);
    };
  }

  broadcast(message: StreamMessage): void {
    for (const client of this.clients) {
      try {
        client(message);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  get size(): number {
    return this.clients.size;
  }
}
