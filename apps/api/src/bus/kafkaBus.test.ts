import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvent } from '@pulse/shared';

type EachMessage = (payload: { message: { value: Buffer | null } }) => Promise<void>;

const mocks = vi.hoisted(() => {
  const state: { eachMessage?: EachMessage } = {};
  const producer = {
    connect: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue([]),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
  const consumer = {
    connect: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    run: vi.fn(async (options: { eachMessage: EachMessage }) => {
      state.eachMessage = options.eachMessage;
    }),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
  return { state, producer, consumer };
});

vi.mock('kafkajs', () => ({
  Kafka: vi.fn(() => ({
    producer: vi.fn(() => mocks.producer),
    consumer: vi.fn(() => mocks.consumer),
  })),
  logLevel: { NOTHING: 0 },
}));

import { KafkaBus } from './kafkaBus.js';

const event: AgentEvent = { type: 'run.started', runId: 'r1', ts: 1, workflow: 'rag' };

function makeBus(): KafkaBus {
  return new KafkaBus({
    clientId: 'agentpulse',
    brokers: ['localhost:9092'],
    topic: 'agentpulse-events',
    groupId: 'agentpulse-api',
  });
}

/** Resolve once `subscribe()`'s lazy consumer startup has registered its handler. */
async function waitForConsumer(): Promise<EachMessage> {
  await vi.waitFor(() => expect(mocks.state.eachMessage).toBeDefined());
  if (!mocks.state.eachMessage) throw new Error('consumer never started');
  return mocks.state.eachMessage;
}

describe('KafkaBus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete mocks.state.eachMessage;
  });

  it('reports the kafka driver', () => {
    expect(makeBus().driver).toBe('kafka');
  });

  it('keys each published message by runId so a run stays on one partition', async () => {
    await makeBus().publish(event);
    expect(mocks.producer.send).toHaveBeenCalledWith({
      topic: 'agentpulse-events',
      messages: [{ key: 'r1', value: JSON.stringify(event) }],
    });
  });

  it('connects the producer once across repeated publishes', async () => {
    const bus = makeBus();
    await bus.publish(event);
    await bus.publish(event);
    expect(mocks.producer.connect).toHaveBeenCalledOnce();
    expect(mocks.producer.send).toHaveBeenCalledTimes(2);
  });

  it('subscribes the consumer to the topic on first subscriber', async () => {
    makeBus().subscribe(vi.fn());
    await waitForConsumer();
    expect(mocks.consumer.connect).toHaveBeenCalledOnce();
    expect(mocks.consumer.subscribe).toHaveBeenCalledWith({
      topic: 'agentpulse-events',
      fromBeginning: false,
    });
  });

  it('delivers a valid inbound message to every subscriber', async () => {
    const bus = makeBus();
    const handler = vi.fn();
    bus.subscribe(handler);
    const eachMessage = await waitForConsumer();

    await eachMessage({ message: { value: Buffer.from(JSON.stringify(event)) } });

    expect(handler).toHaveBeenCalledWith(event);
  });

  it('drops a malformed message without calling subscribers', async () => {
    const bus = makeBus();
    const handler = vi.fn();
    bus.subscribe(handler);
    const eachMessage = await waitForConsumer();

    await eachMessage({ message: { value: Buffer.from('{not valid event}') } });
    await eachMessage({ message: { value: null } });

    expect(handler).not.toHaveBeenCalled();
  });

  it('drops a well-formed message that violates the event schema', async () => {
    const bus = makeBus();
    const handler = vi.fn();
    bus.subscribe(handler);
    const eachMessage = await waitForConsumer();

    await eachMessage({ message: { value: Buffer.from(JSON.stringify({ type: 'nope' })) } });

    expect(handler).not.toHaveBeenCalled();
  });

  it('disconnects both clients on close', async () => {
    const bus = makeBus();
    bus.subscribe(vi.fn());
    await waitForConsumer();
    await bus.publish(event);

    await bus.close();

    expect(mocks.consumer.disconnect).toHaveBeenCalledOnce();
    expect(mocks.producer.disconnect).toHaveBeenCalledOnce();
  });
});
