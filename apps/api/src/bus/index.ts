import type { Config } from '../config.js';
import type { EventBus } from './eventBus.js';
import { InMemoryBus } from './memoryBus.js';
import { PubSubBus } from './pubsubBus.js';
import { KafkaBus } from './kafkaBus.js';

export type { EventBus, EventHandler } from './eventBus.js';
export { InMemoryBus } from './memoryBus.js';
export { PubSubBus } from './pubsubBus.js';
export { KafkaBus } from './kafkaBus.js';

/**
 * Construct the event bus chosen by `BUS_DRIVER`.
 *
 * The switch is exhaustive over the driver enum, so adding a transport without
 * wiring it here fails to compile rather than silently falling back to memory.
 */
export function createBus(config: Config): EventBus {
  switch (config.BUS_DRIVER) {
    case 'pubsub':
      return new PubSubBus({
        ...(config.GCP_PROJECT_ID ? { projectId: config.GCP_PROJECT_ID } : {}),
        topicName: config.PUBSUB_TOPIC,
        subscriptionName: config.PUBSUB_SUBSCRIPTION,
      });
    case 'kafka':
      return new KafkaBus({
        clientId: config.KAFKA_CLIENT_ID,
        brokers: config.KAFKA_BROKERS,
        topic: config.KAFKA_TOPIC,
        groupId: config.KAFKA_GROUP_ID,
      });
    case 'memory':
      return new InMemoryBus();
  }
}
