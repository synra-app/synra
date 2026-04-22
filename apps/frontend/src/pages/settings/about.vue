<script setup lang="ts">
import AppButton from '../../components/base/AppButton.vue'
import AppScrollTabs from '../../components/base/AppScrollTabs.vue'
import type { AboutTabId } from '../../composables/use-about-info'

const { aboutTabs, copyDiagnostics, copyMessage, copyStatus, refreshNow } = useAboutInfo()

const activeAboutTab = ref<AboutTabId>('device')

const activeAboutItems = computed(() => {
  const tab = aboutTabs.value.find((t) => t.id === activeAboutTab.value)
  return tab?.items ?? []
})
</script>

<template>
  <PanelCard
    title="About"
    description="Grouped details; use tabs to switch categories and export diagnostics."
  >
    <div class="flex flex-wrap gap-2">
      <AppButton variant="solid" @click="refreshNow"> Refresh info </AppButton>
      <AppButton @click="copyDiagnostics"> Copy diagnostics JSON </AppButton>
    </div>
    <p
      v-if="copyStatus !== 'idle'"
      class="text-sm"
      :class="copyStatus === 'success' ? 'text-success-4' : 'text-error-4'"
    >
      {{ copyMessage }}
    </p>

    <AppScrollTabs v-model="activeAboutTab" :tabs="aboutTabs" aria-label="About categories" />

    <dl class="space-y-3 text-sm" role="tabpanel" :aria-label="`${activeAboutTab} details`">
      <div
        v-for="item in activeAboutItems"
        :key="item.label"
        class="grid grid-cols-1 gap-1 rounded-xl border border-white/12 bg-white/5 p-3 md:grid-cols-[220px_1fr]"
      >
        <dt class="font-semibold text-muted-2">{{ item.label }}</dt>
        <dd
          class="break-all text-muted-1"
          :class="{ 'font-mono text-xs tracking-tight': item.label === 'Device Instance UUID' }"
        >
          {{ item.value }}
        </dd>
      </div>
    </dl>
  </PanelCard>
</template>
