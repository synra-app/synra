<script setup lang="ts">
import type { PluginCardItem } from '../../composables/use-plugin-catalog'

withDefaults(
  defineProps<{
    plugins: PluginCardItem[]
    syncSupported?: boolean
    isPluginReloading?: (pluginId: string) => boolean
  }>(),
  { syncSupported: false, isPluginReloading: undefined }
)

const emit = defineEmits<{
  open: [plugin: PluginCardItem]
  syncRequest: [plugin: PluginCardItem]
  removeRequest: [plugin: PluginCardItem]
  reloadLocalRequest: [plugin: PluginCardItem]
}>()
</script>

<template>
  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
    <PluginCard
      v-for="plugin in plugins"
      :key="plugin.pluginId"
      :plugin="plugin"
      :sync-supported="syncSupported"
      :reloading="isPluginReloading?.(plugin.pluginId) ?? false"
      @open="emit('open', $event)"
      @sync-request="emit('syncRequest', $event)"
      @remove-request="emit('removeRequest', $event)"
      @reload-local-request="emit('reloadLocalRequest', $event)"
    />
  </div>
</template>
