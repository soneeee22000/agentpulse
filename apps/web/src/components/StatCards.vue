<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useDashboardStore } from '@/stores/dashboard';
import { formatDuration, formatNumber, formatPercent, formatUsd } from '@/lib/format';

const store = useDashboardStore();
const { metrics } = storeToRefs(store);

const cards = computed(() => {
  const m = metrics.value;
  const errorRate = m?.errorRate ?? 0;
  return [
    {
      key: 'active',
      label: 'Active runs',
      value: formatNumber(m?.activeRuns ?? 0),
      accent: 'text-running',
    },
    {
      key: 'throughput',
      label: 'Throughput',
      value: formatNumber(m?.throughputPerMin ?? 0),
      unit: 'runs/min',
      accent: 'text-accent',
    },
    {
      key: 'p95',
      label: 'p95 latency',
      value: formatDuration(m?.p95LatencyMs ?? 0),
      accent: 'text-accent-2',
    },
    {
      key: 'errors',
      label: 'Error rate',
      value: formatPercent(errorRate),
      accent: errorRate > 0.1 ? 'text-error' : 'text-content',
    },
    {
      key: 'cost',
      label: 'Total cost',
      value: formatUsd(m?.totalCostUsd ?? 0, 2),
      accent: 'text-content',
    },
  ];
});
</script>

<template>
  <section class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
    <div
      v-for="card in cards"
      :key="card.key"
      class="rounded-xl border border-border-soft bg-surface/70 p-4"
    >
      <p class="text-xs font-medium tracking-wide text-faint uppercase">{{ card.label }}</p>
      <p class="mt-2 flex items-baseline gap-1.5">
        <span class="text-2xl font-semibold tabular-nums" :class="card.accent">{{
          card.value
        }}</span>
        <span v-if="card.unit" class="text-xs text-faint">{{ card.unit }}</span>
      </p>
    </div>
  </section>
</template>
