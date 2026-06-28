<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useDashboardStore } from '@/stores/dashboard';
import { statusVisual } from '@/lib/visuals';
import { formatDuration, formatNumber, formatRelative, formatUsd } from '@/lib/format';

const store = useDashboardStore();
const { runs, now, selectedRunId } = storeToRefs(store);
</script>

<template>
  <section class="rounded-xl border border-border-soft bg-surface/70">
    <header class="flex items-center justify-between border-b border-border-soft px-4 py-3">
      <h3 class="text-sm font-medium text-content">Live runs</h3>
      <span class="text-xs text-faint">{{ runs.length }} shown · newest first</span>
    </header>

    <div class="overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="text-xs tracking-wide text-faint uppercase">
            <th class="px-4 py-2 font-medium">Workflow</th>
            <th class="px-4 py-2 font-medium">Status</th>
            <th class="px-4 py-2 text-right font-medium">Duration</th>
            <th class="hidden px-4 py-2 text-right font-medium sm:table-cell">Spans</th>
            <th class="hidden px-4 py-2 text-right font-medium md:table-cell">Tokens</th>
            <th class="px-4 py-2 text-right font-medium">Cost</th>
            <th class="hidden px-4 py-2 text-right font-medium lg:table-cell">Started</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="run in runs"
            :key="run.runId"
            class="cursor-pointer border-t border-border-soft/60 transition-colors hover:bg-surface-2"
            :class="{ 'bg-surface-2': run.runId === selectedRunId }"
            @click="store.selectRun(run.runId)"
          >
            <td class="px-4 py-2.5">
              <div class="flex items-center gap-2">
                <span
                  class="h-2 w-2 shrink-0 rounded-full"
                  :class="run.status === 'running' ? 'pulse-dot' : ''"
                  :style="{ background: statusVisual(run.status).color }"
                />
                <span class="font-mono text-[13px] text-content">{{ run.workflow }}</span>
              </div>
            </td>
            <td class="px-4 py-2.5">
              <span
                class="rounded px-1.5 py-0.5 text-[11px] font-medium"
                :class="statusVisual(run.status).pillClass"
              >
                {{ statusVisual(run.status).label }}
              </span>
            </td>
            <td class="px-4 py-2.5 text-right tabular-nums text-muted">
              {{ formatDuration(run.durationMs) }}
            </td>
            <td class="hidden px-4 py-2.5 text-right tabular-nums text-muted sm:table-cell">
              {{ run.spanCount }}
            </td>
            <td class="hidden px-4 py-2.5 text-right tabular-nums text-muted md:table-cell">
              {{ formatNumber(run.totalTokens) }}
            </td>
            <td class="px-4 py-2.5 text-right tabular-nums text-muted">
              {{ formatUsd(run.totalCostUsd) }}
            </td>
            <td class="hidden px-4 py-2.5 text-right text-faint lg:table-cell">
              {{ formatRelative(run.startedAt, now) }}
            </td>
          </tr>
          <tr v-if="runs.length === 0">
            <td colspan="7" class="px-4 py-10 text-center text-sm text-faint">
              Waiting for runs… start the demo traffic to populate the feed.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
