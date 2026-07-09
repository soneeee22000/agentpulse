import { Kafka, logLevel, type Consumer, type Producer } from 'kafkajs';
import { AgentEventSchema, type AgentEvent } from '@pulse/shared';
import type { EventBus, EventHandler } from './eventBus.js';

export interface KafkaBusOptions {
  clientId: string;
  brokers: string[];
  topic: string;
  groupId: string;
}

/** Validation errors are truncated to this many characters before logging. */
const MAX_ERROR_CHARS = 200;

/**
 * Apache Kafka transport — the third interchangeable face of {@link EventBus}.
 *
 * Producers `publish()` to a topic partitioned by `runId`; the consumer group
 * delivers each event back to the projector. Same contract as
 * {@link InMemoryBus} and `PubSubBus`, so flipping `BUS_DRIVER=kafka` changes
 * the transport and nothing else — the projector, SSE fan-out, GraphQL layer
 * and dashboard are untouched.
 *
 * Two properties worth stating explicitly, because they are the reason a
 * partitioned log is not a drop-in for a fan-out bus:
 *
 * - **Per-run ordering.** The message key is `runId`, so every event for a run
 *   hashes to one partition and is consumed in publish order. Ordering across
 *   different runs is not guaranteed, and the read model does not need it.
 * - **At-least-once delivery.** `consumer.run` auto-commits offsets after the
 *   handler resolves, so a crash between handling and commit replays the event.
 *   {@link RunStore.apply} is a fold over a keyed map — applying the same event
 *   twice converges to the same state — so replay is safe.
 *
 * Connections are established lazily and memoized: `publish` connects the
 * producer on first use, `subscribe` starts the consumer on first subscriber.
 * That keeps construction synchronous and matches the other drivers.
 */
export class KafkaBus implements EventBus {
  readonly driver = 'kafka' as const;
  private readonly producer: Producer;
  private readonly consumer: Consumer;
  private readonly handlers: EventHandler[] = [];
  private readonly topic: string;
  private producerReady: Promise<void> | null = null;
  private consumerReady: Promise<void> | null = null;
  private closed = false;

  constructor(options: KafkaBusOptions) {
    this.topic = options.topic;
    const kafka = new Kafka({
      clientId: options.clientId,
      brokers: options.brokers,
      logLevel: logLevel.NOTHING,
    });
    this.producer = kafka.producer({ allowAutoTopicCreation: true });
    this.consumer = kafka.consumer({
      groupId: options.groupId,
      allowAutoTopicCreation: true,
    });
  }

  subscribe(handler: EventHandler): void {
    this.handlers.push(handler);
    if (!this.consumerReady && !this.closed) {
      this.consumerReady = this.startConsumer().catch((err: unknown) => {
        console.error('[bus:kafka] consumer failed to start', err);
      });
    }
  }

  async publish(event: AgentEvent): Promise<void> {
    this.producerReady ??= this.producer.connect();
    await this.producerReady;
    await this.producer.send({
      topic: this.topic,
      messages: [{ key: event.runId, value: JSON.stringify(event) }],
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    this.handlers.length = 0;
    if (this.consumerReady) {
      await this.consumerReady.catch(() => undefined);
      await this.consumer.disconnect().catch(() => undefined);
    }
    if (this.producerReady) {
      await this.producerReady.catch(() => undefined);
      await this.producer.disconnect().catch(() => undefined);
    }
    this.producerReady = null;
    this.consumerReady = null;
  }

  private async startConsumer(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: this.topic, fromBeginning: false });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        this.deliver(message.value);
      },
    });
  }

  /** Validate one inbound record and fan it out; a poison message is dropped, not retried. */
  private deliver(value: Buffer | null): void {
    if (value === null) return;
    try {
      const parsed = AgentEventSchema.safeParse(JSON.parse(value.toString()));
      if (!parsed.success) {
        console.error(
          '[bus:kafka] dropping invalid event',
          parsed.error.message.slice(0, MAX_ERROR_CHARS),
        );
        return;
      }
      for (const handler of this.handlers) void handler(parsed.data);
    } catch (err) {
      console.error('[bus:kafka] failed to handle message', err);
    }
  }
}
