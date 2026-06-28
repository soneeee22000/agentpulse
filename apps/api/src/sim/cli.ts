import type { AgentEvent } from '@pulse/shared';
import { Simulator } from './simulator.js';

/**
 * Standalone load generator: drives synthetic agent traffic against a running
 * AgentPulse API over HTTP (the same `POST /api/events` an external agent SDK
 * would use). Run with `npm run sim`. The in-API simulator covers the offline
 * demo; this script exists to exercise the real ingest path end-to-end.
 */
const API_URL = (process.env.AGENTPULSE_API_URL ?? 'http://localhost:8080').replace(/\/$/, '');
const FLUSH_MS = 250;

const buffer: AgentEvent[] = [];
const simulator = new Simulator((event) => {
  buffer.push(event);
});

async function flush(): Promise<void> {
  if (buffer.length === 0) return;
  const events = buffer.splice(0, buffer.length);
  try {
    const res = await fetch(`${API_URL}/api/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events }),
    });
    if (!res.ok) console.error(`[sim] ingest failed (${res.status})`);
  } catch (err) {
    console.error('[sim] could not reach API', err instanceof Error ? err.message : err);
  }
}

simulator.start();
const flushTimer = setInterval(() => void flush(), FLUSH_MS);
console.log(`[sim] streaming synthetic agent traffic to ${API_URL} (Ctrl+C to stop)`);

process.on('SIGINT', () => {
  simulator.stop();
  clearInterval(flushTimer);
  void flush().then(() => process.exit(0));
});
