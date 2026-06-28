import { describe, expect, it, vi } from 'vitest';
import type { AgentEvent } from '@pulse/shared';
import { InMemoryBus } from './memoryBus.js';

const event: AgentEvent = { type: 'run.started', runId: 'r1', ts: 1, workflow: 'w' };

describe('InMemoryBus', () => {
  it('fans out a published event to every subscriber', async () => {
    const bus = new InMemoryBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe(a);
    bus.subscribe(b);
    await bus.publish(event);
    expect(a).toHaveBeenCalledWith(event);
    expect(b).toHaveBeenCalledWith(event);
  });

  it('isolates a throwing subscriber from the others', async () => {
    const bus = new InMemoryBus();
    const good = vi.fn();
    bus.subscribe(() => {
      throw new Error('bad subscriber');
    });
    bus.subscribe(good);
    await expect(bus.publish(event)).resolves.toBeUndefined();
    expect(good).toHaveBeenCalledOnce();
  });

  it('stops delivering after close', async () => {
    const bus = new InMemoryBus();
    const handler = vi.fn();
    bus.subscribe(handler);
    await bus.close();
    await bus.publish(event);
    expect(handler).not.toHaveBeenCalled();
  });

  it('reports its driver name', () => {
    expect(new InMemoryBus().driver).toBe('memory');
  });
});
