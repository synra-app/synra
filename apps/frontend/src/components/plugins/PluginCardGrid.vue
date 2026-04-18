<script setup lang="ts">
import type { PluginCardItem } from "../../composables/use-plugin-catalog";

defineProps<{
  plugins: PluginCardItem[];
}>();

const emit = defineEmits<{
  open: [plugin: PluginCardItem];
}>();
</script>

<template>
  <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
    <PluginCard
      v-for="plugin in plugins"
      :key="plugin.pluginId"
      :plugin="plugin"
      @open="emit('open', $event)"
    />
  </div>
</template>
