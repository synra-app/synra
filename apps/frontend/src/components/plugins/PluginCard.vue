<script setup lang="ts">
import type { PluginCardItem } from '../../composables/use-plugin-catalog'
import AppButton from '../base/AppButton.vue'

const props = defineProps<{
  plugin: PluginCardItem
}>()

const emit = defineEmits<{
  open: [plugin: PluginCardItem]
}>()

const ICONIFY_DEFAULT_COLOR = '#383838'
const ICONIFY_DEFAULT_ICON = 'material-symbols:extension-outline'
const iconLoadFailed = ref(false)

const iconUrl = computed(() => {
  const icon = props.plugin.icon?.trim() || ICONIFY_DEFAULT_ICON
  return `https://api.iconify.design/${icon}.svg?color=${encodeURIComponent(ICONIFY_DEFAULT_COLOR)}`
})

watch(
  () => props.plugin.icon,
  () => {
    iconLoadFailed.value = false
  }
)
</script>

<template>
  <article class="glass-panel-soft p-4">
    <div class="mb-3 flex items-center gap-3">
      <img
        v-if="plugin.logoUrl"
        :src="plugin.logoUrl"
        :alt="`${plugin.name} logo`"
        class="h-10 w-10 rounded-lg object-cover"
      />
      <span
        v-else
        class="fcc h-10 w-10 overflow-hidden rounded-lg border border-white/12 bg-white/8 text-lg text-muted-2"
      >
        <img
          v-if="!iconLoadFailed"
          :src="iconUrl"
          :alt="`${plugin.name} icon`"
          class="h-6 w-6"
          @error="iconLoadFailed = true"
        />
        <span v-else class="i-lucide-puzzle" />
      </span>
      <div class="min-w-0">
        <p class="truncate font-semibold text-slate-100">{{ plugin.name }}</p>
        <p class="text-xs text-muted-3">ID: {{ plugin.pluginId }}</p>
      </div>
    </div>
    <div class="space-y-1 text-sm text-muted-2">
      <p><strong>Version:</strong> {{ plugin.version }}</p>
      <p><strong>Status:</strong> {{ plugin.status }}</p>
    </div>
    <div class="mt-4">
      <AppButton
        variant="solid"
        block
        :disabled="plugin.installState === 'installing'"
        @click="emit('open', plugin)"
      >
        {{ plugin.installState === 'installing' ? 'Installing...' : 'Open' }}
      </AppButton>
      <p v-if="plugin.installState === 'failed'" class="mt-2 text-xs text-error-7">
        Install failed. Try opening again.
      </p>
    </div>
  </article>
</template>
