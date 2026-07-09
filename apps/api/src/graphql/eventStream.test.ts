import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '@pulse/shared';
import { SseHub } from '../sse/hub.js';
import { subscribeToEvents } from './eventStream.js';

function runStarted(runId: string, ts = 1): AgentEvent {
  return { type: 'run.started', runId, ts, workflow: 'rag' };
}

describe('subscribeToEvents', () => {
  it('delivers an event published after next() is already awaiting', async () => {
    const hub = new SseHub();
    const iterator = subscribeToEvents(hub);

    const pending = iterator.next();
    hub.broadcast({ type: 'event', event: runStarted('r1') });

    await expect(pending).resolves.toEqual({ value: runStarted('r1'), done: false });
    await iterator.return?.();
  });

  it('buffers events published before next() is called', async () => {
    const hub = new SseHub();
    const iterator = subscribeToEvents(hub);

    hub.broadcast({ type: 'event', event: runStarted('r1', 1) });
    hub.broadcast({ type: 'event', event: runStarted('r2', 2) });

    await expect(iterator.next()).resolves.toEqual({ value: runStarted('r1', 1), done: false });
    await expect(iterator.next()).resolves.toEqual({ value: runStarted('r2', 2), done: false });
    await iterator.return?.();
  });

  it('ignores non-event stream messages', async () => {
    const hub = new SseHub();
    const iterator = subscribeToEvents(hub);

    hub.broadcast({
      type: 'run',
      run: {
        runId: 'r1',
        workflow: 'rag',
        status: 'running',
        startedAt: 1,
        spanCount: 0,
        errorCount: 0,
        totalTokens: 0,
        totalCostUsd: 0,
      },
    });
    hub.broadcast({ type: 'event', event: runStarted('r1') });

    await expect(iterator.next()).resolves.toEqual({ value: runStarted('r1'), done: false });
    await iterator.return?.();
  });

  it('filters to a single run when runId is given', async () => {
    const hub = new SseHub();
    const iterator = subscribeToEvents(hub, 'r2');

    hub.broadcast({ type: 'event', event: runStarted('r1', 1) });
    hub.broadcast({ type: 'event', event: runStarted('r2', 2) });

    await expect(iterator.next()).resolves.toEqual({ value: runStarted('r2', 2), done: false });
    await iterator.return?.();
  });

  it('unsubscribes from the hub on return()', async () => {
    const hub = new SseHub();
    const iterator = subscribeToEvents(hub);
    expect(hub.size).toBe(1);

    await iterator.return?.();

    expect(hub.size).toBe(0);
    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true });
  });

  it('resolves a pending next() as done when the iterator closes', async () => {
    const hub = new SseHub();
    const iterator = subscribeToEvents(hub);

    const pending = iterator.next();
    await iterator.return?.();

    await expect(pending).resolves.toEqual({ value: undefined, done: true });
  });

  it('drops events after a broadcast once the iterator is closed', async () => {
    const hub = new SseHub();
    const iterator = subscribeToEvents(hub);
    await iterator.return?.();

    hub.broadcast({ type: 'event', event: runStarted('r1') });

    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true });
  });
});
