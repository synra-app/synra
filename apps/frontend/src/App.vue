<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useAppShellStore } from './stores/app-shell'
import { deactivatePlugin } from './plugins/host'
import { appMenuItems } from './constants/navigation'

const route = useRoute()
const router = useRouter()
const appShellStore = useAppShellStore()
const { isMobileMenuOpen } = storeToRefs(appShellStore)
const appTitle = computed(() => {
  if (route.path.startsWith('/plugins')) {
    return 'Plugin Workspace'
  }
  if (route.path.startsWith('/devices')) {
    return 'Device Sessions'
  }
  if (route.path.startsWith('/settings')) {
    return 'Runtime Settings'
  }
  return 'Dashboard'
})

watch(
  () => route.fullPath,
  () => {
    appShellStore.closeMobileMenu()
  }
)

watch(
  () => route.path,
  (nextPath, previousPath) => {
    const pluginPathPattern = /^\/plugin-([a-z0-9-]+)\//
    const nextMatch = nextPath.match(pluginPathPattern)
    const previousMatch = previousPath?.match(pluginPathPattern)
    const previousPluginId = previousMatch?.[1]
    const nextPluginId = nextMatch?.[1]

    if (previousPluginId && previousPluginId !== nextPluginId) {
      void deactivatePlugin(router, previousPluginId)
    }
  }
)
</script>

<template>
  <AppShellLayout
    :mobile-open="isMobileMenuOpen"
    :app-title="appTitle"
    @toggle-mobile="appShellStore.toggleMobileMenu()"
    @close-mobile="appShellStore.closeMobileMenu()"
  >
    <template #sidebar>
      <SidebarNav
        :items="appMenuItems"
        :current-path="route.path"
        @close-mobile="appShellStore.closeMobileMenu()"
      />
    </template>
    <RouterView />
  </AppShellLayout>
</template>
