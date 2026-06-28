<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { useDashboardStore } from '@/stores/dashboard';
import AppHeader from '@/components/AppHeader.vue';
import StatCards from '@/components/StatCards.vue';
import ChartsRow from '@/components/ChartsRow.vue';
import RunsFeed from '@/components/RunsFeed.vue';
import RunDetailDrawer from '@/components/RunDetailDrawer.vue';

const store = useDashboardStore();

onMounted(() => {
  void store.connect();
});
onBeforeUnmount(() => {
  store.disconnect();
});
</script>

<template>
  <div class="flex h-full flex-col">
    <AppHeader />
    <main class="flex-1 space-y-4 overflow-y-auto px-6 py-5">
      <StatCards />
      <ChartsRow />
      <RunsFeed />
    </main>
    <RunDetailDrawer />
  </div>
</template>
