<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useDashboardStore } from '@/stores/dashboard';
import { formatNumber } from '@/lib/format';

const store = useDashboardStore();
const { connected, busDriver, simRunning, metrics } = storeToRefs(store);

const activeRuns = computed(() => formatNumber(metrics.value?.activeRuns ?? 0));
const eventsPerSec = computed(() => formatNumber(metrics.value?.eventsPerSec ?? 0));
</script>

<template>
  <header
    class="flex items-center justify-between gap-4 border-b border-border-soft bg-surface/60 px-6 py-3.5 backdrop-blur"
  >
    <div class="flex items-center gap-3">
      <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M3 12h4l3 8 4-16 3 8h4" />
        </svg>
      </span>
      <div>
        <h1 class="text-base leading-tight font-semibold text-content">AgentPulse</h1>
        <p class="text-xs text-faint">Live agent observability</p>
      </div>
    </div>

    <div class="flex items-center gap-3 text-xs">
      <span class="flex items-center gap-1.5 text-muted">
        <span class="h-2 w-2 rounded-full" :class="connected ? 'bg-ok pulse-dot' : 'bg-error'" />
        {{ connected ? 'Live' : 'Offline' }}
      </span>

      <span
        v-if="busDriver"
        class="rounded-md border border-border-soft bg-surface-2 px-2 py-1 font-mono text-muted"
      >
        bus: {{ busDriver }}
      </span>

      <span class="hidden items-center gap-1.5 text-muted sm:flex">
        <span class="font-semibold text-running tabular-nums">{{ activeRuns }}</span> active
      </span>
      <span class="hidden items-center gap-1.5 text-muted sm:flex">
        <span class="font-semibold text-info tabular-nums">{{ eventsPerSec }}</span> evt/s
      </span>

      <button
        type="button"
        class="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-medium transition-colors"
        :class="
          simRunning
            ? 'border-running/40 bg-running/10 text-running hover:bg-running/20'
            : 'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20'
        "
        @click="store.toggleSim()"
      >
        <svg
          v-if="simRunning"
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
        <svg
          v-else
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M8 5v14l11-7z" />
        </svg>
        {{ simRunning ? 'Pause demo' : 'Start demo' }}
      </button>
    </div>
  </header>
</template>
