<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useAppShellStore } from "./stores/app-shell";
import { deactivatePlugin } from "./plugins/host";

const route = useRoute();
const router = useRouter();
const appShellStore = useAppShellStore();
const { isSidebarCollapsed, isMobileMenuOpen } = storeToRefs(appShellStore);

const menuItems = [
  { label: "Home", icon: "i-lucide-home", to: "/home" },
  { label: "Plugins", icon: "i-lucide-puzzle", to: "/plugins" },
  { label: "Devices", icon: "i-lucide-monitor-smartphone", to: "/devices" },
  { label: "Settings", icon: "i-lucide-settings", to: "/settings" },
];

watch(
  () => route.fullPath,
  () => {
    appShellStore.closeMobileMenu();
  },
);

watch(
  () => route.path,
  (nextPath, previousPath) => {
    const pluginPathPattern = /^\/plugin-([a-z0-9-]+)\//;
    const nextMatch = nextPath.match(pluginPathPattern);
    const previousMatch = previousPath?.match(pluginPathPattern);
    const previousPluginId = previousMatch?.[1];
    const nextPluginId = nextMatch?.[1];

    if (previousPluginId && previousPluginId !== nextPluginId) {
      void deactivatePlugin(router, previousPluginId);
    }
  },
);
</script>

<template>
  <AppShellLayout :mobile-open="isMobileMenuOpen" @close-mobile="appShellStore.closeMobileMenu()">
    <template #sidebar>
      <SidebarNav
        :items="menuItems"
        :current-path="route.path"
        :collapsed="isSidebarCollapsed"
        @toggle-collapse="appShellStore.toggleSidebar()"
        @close-mobile="appShellStore.closeMobileMenu()"
      />
    </template>
    <template #mobile-trigger>
      <button
        class="inline-flex items-center gap-2 rounded-lg border border-surface-5 bg-surface px-3 py-2 text-sm text-muted-6 lg:hidden"
        @click="appShellStore.toggleMobileMenu()"
      >
        <span class="i-lucide-menu text-base" />
        <span>Menu</span>
      </button>
    </template>
    <RouterView />
  </AppShellLayout>
</template>
