<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useDashboardStore } from '@/stores/dashboard';
import SpanWaterfall from '@/components/SpanWaterfall.vue';
import { statusVisual } from '@/lib/visuals';
import { formatClock, formatDuration, formatNumber, formatUsd } from '@/lib/format';

const store = useDashboardStore();
const { selectedRun, selectedRunId, detailLoading } = storeToRefs(store);
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="selectedRunId" class="fixed inset-0 z-40 flex justify-end">
        <div class="absolute inset-0 bg-canvas/70 backdrop-blur-sm" @click="store.closeDetail()" />

        <aside
          class="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-border-strong bg-surface shadow-2xl"
        >
          <header class="flex items-start justify-between border-b border-border-soft px-5 py-4">
            <div v-if="selectedRun">
              <div class="flex items-center gap-2">
                <span
                  class="h-2.5 w-2.5 rounded-full"
                  :class="selectedRun.status === 'running' ? 'pulse-dot' : ''"
                  :style="{ background: statusVisual(selectedRun.status).color }"
                />
                <h2 class="font-mono text-base font-semibold text-content">
                  {{ selectedRun.workflow }}
                </h2>
                <span
                  class="rounded px-1.5 py-0.5 text-[11px] font-medium"
                  :class="statusVisual(selectedRun.status).pillClass"
                >
                  {{ statusVisual(selectedRun.status).label }}
                </span>
              </div>
              <p class="mt-1 font-mono text-xs text-faint">{{ selectedRun.runId }}</p>
            </div>
            <h2 v-else class="text-base font-semibold text-content">Run detail</h2>

            <button
              type="button"
              class="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-content"
              aria-label="Close"
              @click="store.closeDetail()"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </header>

          <div class="flex-1 overflow-y-auto px-5 py-4">
            <div v-if="detailLoading && !selectedRun" class="py-16 text-center text-sm text-faint">
              Loading run…
            </div>

            <template v-else-if="selectedRun">
              <dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div class="rounded-lg border border-border-soft bg-surface-2 px-3 py-2">
                  <dt class="text-[11px] text-faint">Duration</dt>
                  <dd class="mt-0.5 text-sm font-semibold tabular-nums text-content">
                    {{ formatDuration(selectedRun.durationMs) }}
                  </dd>
                </div>
                <div class="rounded-lg border border-border-soft bg-surface-2 px-3 py-2">
                  <dt class="text-[11px] text-faint">Spans</dt>
                  <dd class="mt-0.5 text-sm font-semibold tabular-nums text-content">
                    {{ selectedRun.spanCount }}
                  </dd>
                </div>
                <div class="rounded-lg border border-border-soft bg-surface-2 px-3 py-2">
                  <dt class="text-[11px] text-faint">Tokens</dt>
                  <dd class="mt-0.5 text-sm font-semibold tabular-nums text-content">
                    {{ formatNumber(selectedRun.totalTokens) }}
                  </dd>
                </div>
                <div class="rounded-lg border border-border-soft bg-surface-2 px-3 py-2">
                  <dt class="text-[11px] text-faint">Cost</dt>
                  <dd class="mt-0.5 text-sm font-semibold tabular-nums text-content">
                    {{ formatUsd(selectedRun.totalCostUsd) }}
                  </dd>
                </div>
              </dl>

              <div class="mt-5">
                <h3 class="mb-3 flex items-center justify-between text-sm font-medium text-content">
                  <span>Span waterfall</span>
                  <span class="text-xs text-faint"
                    >started {{ formatClock(selectedRun.startedAt) }}</span
                  >
                </h3>
                <SpanWaterfall :detail="selectedRun" />
              </div>
            </template>

            <div v-else class="py-16 text-center text-sm text-faint">Run not found.</div>
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.18s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
</style>
