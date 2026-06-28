import { PubSub, type Subscription, type Topic } from '@google-cloud/pubsub';
import { AgentEventSchema, type AgentEvent } from '@pulse/shared';
import type { EventBus, EventHandler } from './eventBus.js';

export interface PubSubBusOptions {
  projectId?: string;
  topicName: string;
  subscriptionName: string;
}

/**
 * Google Cloud Pub/Sub transport — the production face of {@link EventBus}.
 *
 * Producers `publish()` to a topic; events round-trip through GCP and are
 * delivered back to every instance's subscription, which is the real
 * event-driven decoupling the in-memory bus only simulates. Same interface, so
 * nothing downstream changes — flip `BUS_DRIVER=pubsub` and the projector, SSE
 * fan-out and dashboard are unchanged.
 *
 * The topic and subscription must already exist in the project (created via
 * `gcloud pubsub` or Terraform). This adapter is real, reviewable code; it is
 * not deployed in the demo (which runs the in-memory bus).
 */
export class PubSubBus implements EventBus {
  readonly driver = 'pubsub' as const;
  private readonly pubsub: PubSub;
  private readonly topic: Topic;
  private readonly subscription: Subscription;
  private readonly handlers: EventHandler[] = [];
  private listening = false;

  constructor(options: PubSubBusOptions) {
    this.pubsub = new PubSub(options.projectId ? { projectId: options.projectId } : {});
    this.topic = this.pubsub.topic(options.topicName);
    this.subscription = this.topic.subscription(options.subscriptionName);
  }

  subscribe(handler: EventHandler): void {
    this.handlers.push(handler);
    if (!this.listening) this.startListening();
  }

  async publish(event: AgentEvent): Promise<void> {
    await this.topic.publishMessage({ json: event });
  }

  async close(): Promise<void> {
    this.handlers.length = 0;
    await this.subscription.close().catch(() => undefined);
    await this.pubsub.close().catch(() => undefined);
  }

  private startListening(): void {
    this.listening = true;
    this.subscription.on('message', (message) => {
      try {
        const parsed = AgentEventSchema.safeParse(JSON.parse(message.data.toString()));
        if (parsed.success) {
          for (const handler of this.handlers) void handler(parsed.data);
        } else {
          console.error('[bus:pubsub] dropping invalid event', parsed.error.message);
        }
      } catch (err) {
        console.error('[bus:pubsub] failed to handle message', err);
      } finally {
        message.ack();
      }
    });
    this.subscription.on('error', (err) => {
      console.error('[bus:pubsub] subscription error', err);
    });
  }
}
