<script setup lang="ts">
import { computed } from 'vue';
import type { RunDetail, SpanRecord } from '@pulse/shared';
import { kindVisual, statusVisual } from '@/lib/visuals';
import { formatDuration, formatNumber, formatUsd } from '@/lib/format';

const props = defineProps<{ detail: RunDetail }>();

interface Track {
  span: SpanRecord;
  offsetPct: number;
  widthPct: number;
}

const MIN_WIDTH_PCT = 2;

const tracks = computed<Track[]>(() => {
  const start = props.detail.startedAt;
  const fallbackEnd = props.detail.durationMs ? start + props.detail.durationMs : estimateEnd();
  const total = Math.max(1, fallbackEnd - start);
  return props.detail.spans.map((span) => {
    const spanEnd = span.endedAt ?? fallbackEnd;
    const offsetPct = ((span.startedAt - start) / total) * 100;
    const rawWidth = ((spanEnd - span.startedAt) / total) * 100;
    return {
      span,
      offsetPct: Math.max(0, Math.min(100, offsetPct)),
      widthPct: Math.max(MIN_WIDTH_PCT, Math.min(100 - offsetPct, rawWidth)),
    };
  });
});

function estimateEnd(): number {
  const ends = props.detail.spans.map((s) => s.endedAt ?? s.startedAt);
  return ends.length ? Math.max(...ends) : props.detail.startedAt + 1;
}

function meta(span: SpanRecord): string {
  if (span.kind === 'llm' && span.model) {
    const tokens = (span.promptTokens ?? 0) + (span.completionTokens ?? 0);
    return `${span.model} · ${formatNumber(tokens)} tok · ${formatUsd(span.costUsd ?? 0)}`;
  }
  if (span.tool) return span.tool;
  return '';
}
</script>

<template>
  <ol class="space-y-2">
    <li v-for="track in tracks" :key="track.span.spanId">
      <div class="mb-1 flex items-center justify-between gap-3 text-xs">
        <span class="flex items-center gap-2">
          <span
            class="rounded px-1.5 py-0.5 text-[10px] font-medium"
            :style="{
              color: kindVisual(track.span.kind).color,
              background: `${kindVisual(track.span.kind).color}1a`,
            }"
          >
            {{ kindVisual(track.span.kind).label }}
          </span>
          <span class="text-content">{{ track.span.name }}</span>
          <span v-if="meta(track.span)" class="font-mono text-faint">{{ meta(track.span) }}</span>
        </span>
        <span class="tabular-nums" :class="statusVisual(track.span.status).textClass">
          {{ formatDuration(track.span.durationMs) }}
        </span>
      </div>
      <div class="h-2 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          class="h-full rounded-full transition-all"
          :class="track.span.status === 'running' ? 'pulse-dot' : ''"
          :style="{
            marginLeft: `${track.offsetPct}%`,
            width: `${track.widthPct}%`,
            background:
              track.span.status === 'error' ? '#f43f5e' : kindVisual(track.span.kind).color,
          }"
        />
      </div>
      <p v-if="track.span.error" class="mt-1 font-mono text-[11px] text-error">
        {{ track.span.error }}
      </p>
    </li>
  </ol>
</template>
