<script setup lang="ts">
import AppScrollTabs from '../../components/base/AppScrollTabs.vue'
import type { AppScrollTabItem } from '../../components/base/AppScrollTabs.vue'
import { RouterView } from 'vue-router'

type SettingsTabId = 'basic' | 'about' | 'development'

const settingsTabs: AppScrollTabItem[] = [
  { id: 'basic', label: 'Basic Info' },
  { id: 'about', label: 'About' },
  { id: 'development', label: 'Development' }
]

const route = useRoute()
const router = useRouter()

const activeSettingsTab = computed<SettingsTabId>({
  get() {
    if (route.path.endsWith('/about')) {
      return 'about'
    }
    if (route.path.endsWith('/development')) {
      return 'development'
    }
    return 'basic'
  },
  set(nextTab) {
    const targetPath =
      nextTab === 'about'
        ? '/settings/about'
        : nextTab === 'development'
          ? '/settings/development'
          : '/settings/basic'
    if (route.path !== targetPath) {
      void router.push(targetPath)
    }
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
