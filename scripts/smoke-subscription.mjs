// Smoke-test the GraphQL subscription over a real WebSocket using the
// graphql-transport-ws protocol. Exits non-zero unless a live agent event
// arrives, so "subscriptions work" is a verified claim, not an assumed one.
import { clearTimeout, setTimeout } from 'node:timers';
import WebSocket from 'ws';

const URL = process.env.WS_URL ?? 'ws://127.0.0.1:8099/graphql';
const TIMEOUT_MS = 15_000;

const QUERY = `subscription {
  agentEvents {
    __typename
    runId
    ts
    ... on RunStarted { workflow }
    ... on SpanStarted { spanId kind }
    ... on ToolCalled { tool args }
    ... on RunEnded { status durationMs }
  }
}`;

const socket = new WebSocket(URL, 'graphql-transport-ws');
const received = [];

const timer = setTimeout(() => {
  console.error(`FAIL: no events within ${TIMEOUT_MS}ms`);
  socket.close();
  process.exit(1);
}, TIMEOUT_MS);

socket.on('open', () => socket.send(JSON.stringify({ type: 'connection_init' })));

socket.on('message', (raw) => {
  const message = JSON.parse(raw.toString());

  if (message.type === 'connection_ack') {
    socket.send(JSON.stringify({ id: '1', type: 'subscribe', payload: { query: QUERY } }));
    return;
  }

  if (message.type === 'error') {
    console.error('FAIL: subscription error', JSON.stringify(message.payload));
    clearTimeout(timer);
    socket.close();
    process.exit(1);
  }

  if (message.type === 'next') {
    const event = message.payload?.data?.agentEvents;
    if (!event) return;
    received.push(event);
    console.log(`  <- ${event.__typename.padEnd(12)} run=${event.runId}`);

    if (received.length >= 3) {
      clearTimeout(timer);
      const kinds = [...new Set(received.map((e) => e.__typename))];
      console.log(`\nPASS: ${received.length} events, concrete types: ${kinds.join(', ')}`);
      socket.send(JSON.stringify({ id: '1', type: 'complete' }));
      socket.close();
      process.exit(0);
    }
  }
});

socket.on('error', (err) => {
  console.error('FAIL: socket error', err.message);
  clearTimeout(timer);
  process.exit(1);
});
