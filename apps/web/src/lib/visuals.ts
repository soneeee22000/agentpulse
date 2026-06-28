import type { LifecycleStatus, SpanKind } from '@pulse/shared';

export interface StatusVisual {
  label: string;
  /** Hex for charts / SVG. */
  color: string;
  /** Tailwind text token class. */
  textClass: string;
  /** Tailwind background token class (subtle pill fill). */
  pillClass: string;
}

const STATUS: Record<LifecycleStatus, StatusVisual> = {
  running: {
    label: 'Running',
    color: '#f59e0b',
    textClass: 'text-running',
    pillClass: 'bg-running/10 text-running',
  },
  ok: { label: 'OK', color: '#10b981', textClass: 'text-ok', pillClass: 'bg-ok/10 text-ok' },
  error: {
    label: 'Error',
    color: '#f43f5e',
    textClass: 'text-error',
    pillClass: 'bg-error/10 text-error',
  },
};

export function statusVisual(status: LifecycleStatus): StatusVisual {
  return STATUS[status];
}

export interface KindVisual {
  label: string;
  color: string;
}

const KIND: Record<SpanKind, KindVisual> = {
  plan: { label: 'Plan', color: '#a78bfa' },
  retrieve: { label: 'Retrieve', color: '#38bdf8' },
  tool: { label: 'Tool', color: '#f59e0b' },
  llm: { label: 'LLM', color: '#10b981' },
  synthesize: { label: 'Synthesize', color: '#2dd4bf' },
};

export function kindVisual(kind: SpanKind): KindVisual {
  return KIND[kind];
}
