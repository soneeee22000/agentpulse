import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type {
  BusDriver,
  MetricsSnapshot,
  RunDetail,
  RunSummary,
  StreamMessage,
} from '@pulse/shared';
import { getHealth, getRun, openDashboardStream, startSim, stopSim } from '@/lib/apiClient';

/** Seconds of 1Hz history retained for the charts. */
const HISTORY_CAP = 90;
/** Runs kept in the live feed. */
const FEED_CAP = 50;

export const useDashboardStore = defineStore('dashboard', () => {
  const connected = ref(false);
  const busDriver = ref<BusDriver | null>(null);
  const simRunning = ref(false);

  const metrics = ref<MetricsSnapshot | null>(null);
  const history = ref<MetricsSnapshot[]>([]);
  const runsById = ref<Record<string, RunSummary>>({});

  const selectedRunId = ref<string | null>(null);
  const selectedRun = ref<RunDetail | null>(null);
  const detailLoading = ref(false);

  let dispose: (() => void) | null = null;

  const runs = computed(() =>
    Object.values(runsById.value)
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, FEED_CAP),
  );

  /** Clock that advances each metric tick, so relative times re-render live. */
  const now = computed(() => metrics.value?.ts ?? Date.now());

  async function connect(): Promise<void> {
    try {
      const health = await getHealth();
      busDriver.value = health.busDriver;
      simRunning.value = health.simRunning;
    } catch {
      // Health is best-effort; the stream still hydrates everything below.
    }

    dispose = openDashboardStream({
      onOpen: () => {
        connected.value = true;
      },
      onError: () => {
        connected.value = false;
      },
      onMessage: handleMessage,
    });
  }

  function disconnect(): void {
    dispose?.();
    dispose = null;
    connected.value = false;
  }

  function handleMessage(message: StreamMessage): void {
    switch (message.type) {
      case 'snapshot':
        metrics.value = message.metrics;
        history.value = [...message.history];
        runsById.value = Object.fromEntries(message.runs.map((r) => [r.runId, r]));
        break;
      case 'metrics':
        metrics.value = message.metrics;
        pushHistory(message.metrics);
        break;
      case 'run':
        runsById.value[message.run.runId] = message.run;
        refreshSelectedIfRunning(message.run.runId);
        break;
      case 'event':
        break;
    }
  }

  function pushHistory(snapshot: MetricsSnapshot): void {
    history.value.push(snapshot);
    if (history.value.length > HISTORY_CAP) {
      history.value.splice(0, history.value.length - HISTORY_CAP);
    }
  }

  async function selectRun(runId: string): Promise<void> {
    selectedRunId.value = runId;
    detailLoading.value = true;
    try {
      selectedRun.value = await getRun(runId);
    } catch {
      selectedRun.value = null;
    } finally {
      detailLoading.value = false;
    }
  }

  function closeDetail(): void {
    selectedRunId.value = null;
    selectedRun.value = null;
  }

  function refreshSelectedIfRunning(runId: string): void {
    if (runId !== selectedRunId.value) return;
    if (selectedRun.value && selectedRun.value.status !== 'running') return;
    void selectRunQuietly(runId);
  }

  async function selectRunQuietly(runId: string): Promise<void> {
    try {
      const detail = await getRun(runId);
      if (selectedRunId.value === runId) selectedRun.value = detail;
    } catch {
      // keep the last good detail
    }
  }

  async function toggleSim(): Promise<void> {
    const next = simRunning.value ? await stopSim() : await startSim();
    simRunning.value = next.running;
  }

  return {
    connected,
    busDriver,
    simRunning,
    metrics,
    history,
    runs,
    now,
    selectedRunId,
    selectedRun,
    detailLoading,
    connect,
    disconnect,
    selectRun,
    closeDetail,
    toggleSim,
  };
});
