<script setup lang="ts">
import AppScrollTabs from '../../components/base/AppScrollTabs.vue'
import type { AppScrollTabItem } from '../../components/base/AppScrollTabs.vue'

type SettingsTabId = 'basic' | 'about'
const settingsTabs: AppScrollTabItem[] = [
  { id: 'basic', label: 'Basic Info' },
  { id: 'about', label: 'About' }
]
const route = useRoute()
const router = useRouter()

const activeSettingsTab = computed<SettingsTabId>({
  get() {
    return route.path.endsWith('/about') ? 'about' : 'basic'
  },
  set(nextTab) {
    const targetPath = nextTab === 'about' ? '/settings/about' : '/settings/basic'
    if (route.path !== targetPath) {
      void router.push(targetPath)
    }
  }
})

onMounted(() => {
  if (route.path === '/settings') {
    void router.replace('/settings/basic')
  }
})
</script>

<template>
  <section class="space-y-4">
    <AppScrollTabs
      v-model="activeSettingsTab"
      :tabs="settingsTabs"
      aria-label="Settings sections"
    />
    <RouterView />
  </section>
</template>
