<script setup lang="ts">
import { computed } from 'vue';
import { VisXYContainer, VisLine, VisArea, VisAxis, VisCrosshair, VisTooltip } from '@unovis/vue';
import type { MetricsSnapshot } from '@pulse/shared';
import { formatClock } from '@/lib/format';

export interface ChartSeries {
  label: string;
  color: string;
  accessor: (d: MetricsSnapshot) => number;
}

const props = defineProps<{
  data: MetricsSnapshot[];
  series: ChartSeries[];
  height?: number;
  area?: boolean;
  valueFormat?: (value: number) => string;
}>();

const x = (d: MetricsSnapshot): number => d.ts;
const yAccessors = computed(() => props.series.map((s) => s.accessor));
const colors = computed(() => props.series.map((s) => s.color));
const format = (value: number): string =>
  props.valueFormat ? props.valueFormat(value) : String(Math.round(value));

const areaSeries = computed(() => (props.area ? (props.series[0] ?? null) : null));

function tooltip(d: MetricsSnapshot): string {
  const rows = props.series
    .map(
      (s) =>
        `<div style="display:flex;gap:14px;justify-content:space-between">` +
        `<span style="color:${s.color}">${s.label}</span>` +
        `<span style="color:#e5e7eb">${format(s.accessor(d))}</span></div>`,
    )
    .join('');
  return `<div style="font-size:11px;font-family:ui-sans-serif"><div style="color:#6b7280;margin-bottom:4px">${formatClock(
    d.ts,
  )}</div>${rows}</div>`;
}
</script>

<template>
  <VisXYContainer
    :data="data"
    :height="height ?? 150"
    :margin="{ left: 6, right: 6, top: 8, bottom: 4 }"
  >
    <VisArea
      v-if="areaSeries"
      :x="x"
      :y="areaSeries.accessor"
      :color="areaSeries.color"
      :opacity="0.14"
      curveType="basis"
    />
    <VisLine :x="x" :y="yAccessors" :color="colors" :lineWidth="2" curveType="basis" />
    <VisAxis
      type="x"
      :tickFormat="formatClock"
      :numTicks="4"
      :gridLine="false"
      :tickLine="false"
      :domainLine="false"
    />
    <VisAxis
      type="y"
      :tickFormat="format"
      :numTicks="3"
      :gridLine="true"
      :tickLine="false"
      :domainLine="false"
    />
    <VisCrosshair :template="tooltip" color="#10b981" />
    <VisTooltip />
  </VisXYContainer>
</template>
