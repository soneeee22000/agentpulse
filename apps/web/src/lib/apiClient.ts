import type { z } from 'zod';
import {
  HealthResponseSchema,
  RunDetailSchema,
  RunListResponseSchema,
  SimStateSchema,
  StreamMessageSchema,
  type HealthResponse,
  type RunDetail,
  type RunListResponse,
  type SimState,
  type StreamMessage,
} from '@pulse/shared';

/** Backend base URL; configurable per-environment via Vite env. */
export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function getJson<T>(path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new ApiError(`GET ${path} failed (${res.status})`, res.status);
  return schema.parse(await res.json());
}

async function postJson<T>(path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { method: 'POST' });
  if (!res.ok) throw new ApiError(`POST ${path} failed (${res.status})`, res.status);
  return schema.parse(await res.json());
}

export function getHealth(): Promise<HealthResponse> {
  return getJson('/api/health', HealthResponseSchema);
}

export function getRuns(): Promise<RunListResponse> {
  return getJson('/api/runs?limit=50', RunListResponseSchema);
}

export function getRun(runId: string): Promise<RunDetail> {
  return getJson(`/api/runs/${encodeURIComponent(runId)}`, RunDetailSchema);
}

export function startSim(): Promise<SimState> {
  return postJson('/api/sim/start', SimStateSchema);
}

export function stopSim(): Promise<SimState> {
  return postJson('/api/sim/stop', SimStateSchema);
}

export interface DashboardStreamHandlers {
  onMessage: (message: StreamMessage) => void;
  onOpen?: () => void;
  onError?: () => void;
}

/**
 * Subscribe to the live dashboard feed over SSE.
 *
 * `/api/stream` is a GET, so we use the browser's native `EventSource` (it
 * auto-reconnects with backoff). Every frame is validated against the shared
 * {@link StreamMessageSchema} so no malformed message can reach the store.
 * Returns a disposer that closes the connection.
 */
export function openDashboardStream(handlers: DashboardStreamHandlers): () => void {
  const source = new EventSource(`${API_URL}/api/stream`);

  source.onopen = () => handlers.onOpen?.();
  source.onerror = () => handlers.onError?.();
  source.onmessage = (event: MessageEvent<string>) => {
    const parsed = StreamMessageSchema.safeParse(JSON.parse(event.data));
    if (parsed.success) handlers.onMessage(parsed.data);
  };

  return () => source.close();
}
