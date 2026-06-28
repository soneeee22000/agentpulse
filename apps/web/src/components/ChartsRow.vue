<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useDashboardStore } from '@/stores/dashboard';
import TimeSeriesChart, { type ChartSeries } from '@/components/charts/TimeSeriesChart.vue';
import { formatDuration, formatNumber } from '@/lib/format';

const store = useDashboardStore();
const { history, metrics } = storeToRefs(store);

const throughput: ChartSeries[] = [
  { label: 'runs/min', color: '#10b981', accessor: (d) => d.throughputPerMin },
];
const latency: ChartSeries[] = [
  { label: 'p50', color: '#2dd4bf', accessor: (d) => d.p50LatencyMs },
  { label: 'p95', color: '#f59e0b', accessor: (d) => d.p95LatencyMs },
];
const events: ChartSeries[] = [
  { label: 'events/s', color: '#38bdf8', accessor: (d) => d.eventsPerSec },
];

const panels = [
  {
    key: 'throughput',
    title: 'Throughput',
    unit: 'runs / min',
    series: throughput,
    area: true,
    format: (v: number) => formatNumber(v),
    current: () => formatNumber(metrics.value?.throughputPerMin ?? 0),
  },
  {
    key: 'latency',
    title: 'Latency p50 / p95',
    unit: 'ms',
    series: latency,
    area: false,
    format: (v: number) => formatDuration(v),
    current: () => formatDuration(metrics.value?.p95LatencyMs ?? 0),
  },
  {
    key: 'events',
    title: 'Event throughput',
    unit: 'events / sec',
    series: events,
    area: true,
    format: (v: number) => formatNumber(v),
    current: () => formatNumber(metrics.value?.eventsPerSec ?? 0),
  },
];
</script>

<template>
  <section class="grid grid-cols-1 gap-4 lg:grid-cols-3">
    <div
      v-for="panel in panels"
      :key="panel.key"
      class="rounded-xl border border-border-soft bg-surface/70 p-4"
    >
      <header class="mb-1 flex items-baseline justify-between">
        <div>
          <h3 class="text-sm font-medium text-content">{{ panel.title }}</h3>
          <p class="text-xs text-faint">{{ panel.unit }}</p>
        </div>
        <div class="flex items-center gap-2">
          <span
            v-for="s in panel.series"
            :key="s.label"
            class="flex items-center gap-1 text-[11px] text-muted"
          >
            <span class="h-1.5 w-1.5 rounded-full" :style="{ background: s.color }" />
            {{ s.label }}
          </span>
        </div>
      </header>
      <TimeSeriesChart
        :data="history"
        :series="panel.series"
        :area="panel.area"
        :height="140"
        :value-format="panel.format"
      />
    </div>
  </section>
</template>
