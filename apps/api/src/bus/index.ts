import type { Config } from '../config.js';
import type { EventBus } from './eventBus.js';
import { InMemoryBus } from './memoryBus.js';
import { PubSubBus } from './pubsubBus.js';

export type { EventBus, EventHandler } from './eventBus.js';
export { InMemoryBus } from './memoryBus.js';
export { PubSubBus } from './pubsubBus.js';

/** Construct the event bus chosen by `BUS_DRIVER`. */
export function createBus(config: Config): EventBus {
  if (config.BUS_DRIVER === 'pubsub') {
    return new PubSubBus({
      ...(config.GCP_PROJECT_ID ? { projectId: config.GCP_PROJECT_ID } : {}),
      topicName: config.PUBSUB_TOPIC,
      subscriptionName: config.PUBSUB_SUBSCRIPTION,
    });
  }
  return new InMemoryBus();
}
