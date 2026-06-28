import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvent } from '@pulse/shared';

const mocks = vi.hoisted(() => {
  const handlers: Record<string, (msg: unknown) => void> = {};
  const publishMessage = vi.fn().mockResolvedValue('msg-id');
  const subscription = {
    on: vi.fn((event: string, cb: (msg: unknown) => void) => {
      handlers[event] = cb;
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const topic = { publishMessage, subscription: vi.fn(() => subscription) };
  const pubsubClose = vi.fn().mockResolvedValue(undefined);
  return { handlers, publishMessage, subscription, topic, pubsubClose };
});

vi.mock('@google-cloud/pubsub', () => ({
  PubSub: vi.fn(() => ({
    topic: vi.fn(() => mocks.topic),
    close: mocks.pubsubClose,
  })),
}));

import { PubSubBus } from './pubsubBus.js';

const event: AgentEvent = { type: 'run.started', runId: 'r1', ts: 1, workflow: 'rag' };

function makeBus(): PubSubBus {
  return new PubSubBus({ topicName: 'agentpulse-events', subscriptionName: 'sub' });
}

describe('PubSubBus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mocks.handlers)) delete mocks.handlers[key];
  });

  it('reports the pubsub driver', () => {
    expect(makeBus().driver).toBe('pubsub');
  });

  it('publishes events as JSON to the topic', async () => {
    await makeBus().publish(event);
    expect(mocks.publishMessage).toHaveBeenCalledWith({ json: event });
  });

  it('delivers a valid inbound message to subscribers and acks it', () => {
    const bus = makeBus();
    const handler = vi.fn();
    bus.subscribe(handler);

    const ack = vi.fn();
    mocks.handlers.message?.({ data: Buffer.from(JSON.stringify(event)), ack });

    expect(handler).toHaveBeenCalledWith(event);
    expect(ack).toHaveBeenCalledOnce();
  });

  it('drops an invalid message without calling subscribers but still acks', () => {
    const bus = makeBus();
    const handler = vi.fn();
    bus.subscribe(handler);

    const ack = vi.fn();
    mocks.handlers.message?.({ data: Buffer.from('{not valid event}'), ack });

    expect(handler).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledOnce();
  });
});
