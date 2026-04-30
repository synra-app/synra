<script setup lang="ts">
import type { PluginCardItem } from '../../composables/use-plugin-catalog'
import AppButton from '../base/AppButton.vue'

const props = withDefaults(
  defineProps<{
    plugin: PluginCardItem
    syncSupported?: boolean
    reloading?: boolean
  }>(),
  { syncSupported: false, reloading: false }
)

const emit = defineEmits<{
  open: [plugin: PluginCardItem]
  syncRequest: [plugin: PluginCardItem]
  removeRequest: [plugin: PluginCardItem]
  reloadLocalRequest: [plugin: PluginCardItem]
}>()

const ICONIFY_DEFAULT_COLOR = '#383838'
const ICONIFY_DEFAULT_ICON = 'material-symbols:extension-outline'
const iconLoadFailed = ref(false)
const mobileActionsOpen = ref(false)

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

watch(mobileActionsOpen, (open) => {
  if (typeof document === 'undefined') {
    return
  }
  document.documentElement.style.overflow = open ? 'hidden' : ''
})

onUnmounted(() => {
  if (typeof document !== 'undefined') {
    document.documentElement.style.overflow = ''
  }
})

const showHostActionsChrome = computed(() => props.syncSupported && !props.plugin.builtin)

const resolvedLocalSourcePath = computed(() => props.plugin.localSourcePath?.trim() ?? '')

const canReloadFromLocalFolder = computed(
  () => props.plugin.installSource === 'local' && resolvedLocalSourcePath.value.length > 0
)

/**
 * Toolbar when host can act on the plugin: ready/broken, or registering but we already have a local path
 * (fresh local install — cards stay on `registering` until the host registers routes).
 */
const showToolbar = computed(() => {
  if (!showHostActionsChrome.value) {
    return false
  }
  if (props.plugin.status === 'ready' || props.plugin.status === 'broken') {
    return true
  }
  return props.plugin.status === 'registering' && canReloadFromLocalFolder.value
})

const showSyncAction = computed(() => props.plugin.status === 'ready')

const showReloadLocalAction = computed(
  () =>
    showHostActionsChrome.value &&
    canReloadFromLocalFolder.value &&
    (props.plugin.status === 'ready' ||
      props.plugin.status === 'broken' ||
      props.plugin.status === 'registering')
)

const installSourceLabel = computed(() => {
  const s = props.plugin.installSource
  if (s === 'local') {
    return 'Local'
  }
  if (s === 'registry') {
    return 'Registry'
  }
  if (s === 'git') {
    return 'Git'
  }
  return '—'
})

const showRemoveAction = computed(
  () => props.plugin.status === 'ready' || props.plugin.status === 'broken'
)

const toolbarBusy = computed(
  () =>
    props.reloading ||
    props.plugin.status === 'installing' ||
    props.plugin.status === 'registering' ||
    props.plugin.status === 'removing'
)

function closeMobileSheet(): void {
  mobileActionsOpen.value = false
}

function onMobileSync(): void {
  closeMobileSheet()
  emit('syncRequest', props.plugin)
}

function onMobileRemove(): void {
  closeMobileSheet()
  emit('removeRequest', props.plugin)
}

function onMobileReloadLocal(): void {
  closeMobileSheet()
  emit('reloadLocalRequest', props.plugin)
}

const actionLabel = computed(() => {
  if (props.reloading) {
    return 'Reloading...'
  }
  if (props.plugin.status === 'installing') {
    return 'Installing...'
  }
  if (props.plugin.status === 'registering') {
    return 'Registering...'
  }
  if (props.plugin.status === 'removing') {
    return 'Removing...'
  }
  if (props.plugin.status === 'broken') {
    return 'Repair'
  }
  return props.plugin.status === 'ready' ? 'Open' : 'Install'
})
</script>

<template>
  <article class="glass-panel-soft group relative p-4">
    <div v-if="showToolbar" class="absolute right-2 top-2 z-10 flex items-start justify-end gap-1">
      <!-- Desktop / tablet: ghost icon buttons, visible on card hover or focus-within -->
      <div
        class="hidden gap-0.5 md:flex md:opacity-0 md:transition-opacity md:duration-200 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
      >
        <AppButton
          v-if="showSyncAction"
          variant="ghost"
          size="icon"
          class="text-slate-200 hover:!text-slate-50"
          title="Sync to devices"
          aria-label="Sync to devices"
          :disabled="toolbarBusy"
          @click.stop.prevent="emit('syncRequest', plugin)"
        >
          <span class="i-lucide-share-2 block h-4 w-4" aria-hidden="true" />
        </AppButton>
        <AppButton
          v-if="showReloadLocalAction"
          variant="ghost"
          size="icon"
          class="text-slate-200 hover:!text-slate-50"
          title="Reload from local path"
          aria-label="Reload from local path"
          :disabled="toolbarBusy"
          @click.stop.prevent="emit('reloadLocalRequest', plugin)"
        >
          <span class="i-lucide-refresh-cw block h-4 w-4" aria-hidden="true" />
        </AppButton>
        <AppButton
          v-if="showRemoveAction"
          variant="ghost"
          size="icon"
          class="text-slate-200 hover:!border-red-500/25 hover:!bg-red-500/15 hover:!text-red-300"
          title="Remove plugin"
          aria-label="Remove plugin"
          :disabled="toolbarBusy"
          @click.stop.prevent="emit('removeRequest', plugin)"
        >
          <span class="i-lucide-trash-2 block h-4 w-4" aria-hidden="true" />
        </AppButton>
      </div>

      <!-- Mobile: overflow menu -->
      <button
        type="button"
        class="app-focus-ring flex rounded-lg bg-slate-950/85 p-1.5 text-slate-200 shadow-md ring-1 ring-white/12 backdrop-blur-sm md:hidden"
        title="Plugin actions"
        aria-label="Plugin actions"
        aria-haspopup="dialog"
        :aria-expanded="mobileActionsOpen"
        @click.stop.prevent="mobileActionsOpen = true"
      >
        <span class="i-lucide-more-vertical block h-5 w-5" aria-hidden="true" />
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="mobileActionsOpen && showToolbar"
        class="fixed inset-0 z-[85] md:hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plugin-mobile-actions-title"
      >
        <div class="absolute inset-0 bg-black/60 backdrop-blur-[2px]" @click="closeMobileSheet" />
        <div
          class="absolute bottom-0 left-0 right-0 max-h-[min(70vh,420px)] overflow-y-auto rounded-t-2xl border border-white/12 border-b-0 bg-slate-950/98 px-4 pt-4 shadow-2xl"
          style="padding-bottom: max(1rem, env(safe-area-inset-bottom, 0px))"
        >
          <p
            id="plugin-mobile-actions-title"
            class="mb-4 text-center text-sm font-semibold text-slate-100"
          >
            {{ plugin.name }}
          </p>
          <div class="flex flex-col gap-2 pb-2">
            <button
              v-if="showSyncAction"
              type="button"
              class="app-focus-ring flex w-full items-center justify-center gap-2 rounded-xl border border-white/14 bg-white/8 px-4 py-3 text-sm font-medium text-slate-100 hover:bg-white/12 disabled:pointer-events-none disabled:opacity-45"
              :disabled="toolbarBusy"
              @click="onMobileSync"
            >
              <span class="i-lucide-share-2 h-5 w-5 shrink-0" aria-hidden="true" />
              Sync to devices
            </button>
            <button
              v-if="showReloadLocalAction"
              type="button"
              class="app-focus-ring flex w-full items-center justify-center gap-2 rounded-xl border border-white/14 bg-white/8 px-4 py-3 text-sm font-medium text-slate-100 hover:bg-white/12 disabled:pointer-events-none disabled:opacity-45"
              :disabled="toolbarBusy"
              @click="onMobileReloadLocal"
            >
              <span class="i-lucide-refresh-cw h-5 w-5 shrink-0" aria-hidden="true" />
              Reload from local
            </button>
            <button
              v-if="showRemoveAction"
              type="button"
              class="app-focus-ring flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-200 hover:bg-red-500/20 disabled:pointer-events-none disabled:opacity-45"
              :disabled="toolbarBusy"
              @click="onMobileRemove"
            >
              <span class="i-lucide-trash-2 h-5 w-5 shrink-0" aria-hidden="true" />
              Remove plugin
            </button>
            <button
              type="button"
              class="app-focus-ring mt-1 w-full rounded-xl px-4 py-3 text-sm text-muted-2 hover:bg-white/6"
              @click="closeMobileSheet"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <div class="mb-3 flex items-center gap-3" :class="showToolbar ? 'pr-12 md:pr-[9rem]' : ''">
      <img
        v-if="plugin.logoUrl"
        :src="plugin.logoUrl"
        :alt="`${plugin.name} logo`"
        class="h-10 w-10 shrink-0 rounded-lg object-cover"
      />
      <span
        v-else
        class="fcc h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-white/12 bg-white/8 text-lg text-muted-2"
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
      <div class="min-w-0 flex-1">
        <p class="truncate font-semibold text-slate-100">{{ plugin.name }}</p>
        <p class="text-xs text-muted-3">ID: {{ plugin.pluginId }}</p>
      </div>
    </div>
    <div class="space-y-1 text-sm text-muted-2">
      <p><strong>Version:</strong> {{ plugin.version }}</p>
      <p><strong>Source:</strong> {{ installSourceLabel }}</p>
      <p><strong>Status:</strong> {{ plugin.status }}</p>
    </div>
    <div class="mt-4">
      <AppButton
        variant="solid"
        block
        :disabled="
          reloading ||
          plugin.status === 'installing' ||
          plugin.status === 'registering' ||
          plugin.status === 'removing'
        "
        @click="emit('open', plugin)"
      >
        {{ actionLabel }}
      </AppButton>
      <p v-if="plugin.failure" class="mt-2 text-xs text-error-7">
        {{ plugin.failure.message }}
      </p>
    </div>
  </article>
</template>
