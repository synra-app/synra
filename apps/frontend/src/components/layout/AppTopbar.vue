<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import AppButton from '../base/AppButton.vue'

defineProps<{
  title?: string
}>()

const emit = defineEmits<{
  toggleMobile: []
}>()

const hasWindowControls = ref(false)
const electronPlatform = ref<string | undefined>(undefined)
const isMaximized = ref(false)

const useMacNativeTitlebar = computed(() => electronPlatform.value === 'darwin')

const showCustomWindowButtons = computed(
  () => hasWindowControls.value && electronPlatform.value !== 'darwin'
)

let offWindowStateChange: (() => void) | undefined

function syncWindowState(): void {
  if (!window.__synraWindowControls?.isMaximized) {
    return
  }
  void window.__synraWindowControls.isMaximized().then((state) => {
    isMaximized.value = state
  })
}

function minimizeWindow(): void {
  void window.__synraWindowControls?.minimize()
}

function toggleMaximizeWindow(): void {
  void window.__synraWindowControls?.toggleMaximize()
}

function closeWindow(): void {
  void window.__synraWindowControls?.close()
}

function onHeaderDoubleClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null
  if (target?.closest('.app-titlebar-no-drag')) {
    return
  }
  if (!hasWindowControls.value) {
    return
  }
  toggleMaximizeWindow()
}

onMounted(() => {
  const wc = window.__synraWindowControls
  hasWindowControls.value = Boolean(wc)
  electronPlatform.value = wc?.platform
  if (!hasWindowControls.value) {
    return
  }
  if (electronPlatform.value !== 'darwin') {
    syncWindowState()
    offWindowStateChange = wc?.onWindowStateChange?.((state) => {
      isMaximized.value = state.maximized
    })
  }
})

onUnmounted(() => {
  offWindowStateChange?.()
})
</script>

<template>
  <header
    class="app-titlebar-drag z-[60] h-14 border-b border-white/10 bg-[#0d142acc] backdrop-blur-xl lg:h-11"
    :class="useMacNativeTitlebar ? 'pl-[78px] pr-2.5 lg:pr-3' : 'px-2.5 lg:px-3'"
    @dblclick="onHeaderDoubleClick"
  >
    <div class="flex h-full items-center justify-between gap-2.5">
      <div class="app-titlebar-no-drag flex min-w-0 items-center gap-2">
        <AppButton
          class="app-titlebar-no-drag lg:hidden"
          size="icon"
          aria-label="Toggle menu"
          @click="emit('toggleMobile')"
        >
          <span class="i-lucide-menu text-sm" />
        </AppButton>
        <template v-if="!useMacNativeTitlebar">
          <span class="fcc h-6.5 w-6.5 rounded-md bg-primary/24 text-primary-3">
            <span class="i-lucide-sparkles text-[13px]" />
          </span>
          <p class="truncate text-xs font-semibold text-slate-100">Synra</p>
        </template>
      </div>

      <div v-if="useMacNativeTitlebar" class="app-titlebar-no-drag flex min-w-0 items-center gap-2">
        <p class="truncate text-xs font-semibold text-slate-100">Synra</p>
        <span class="fcc h-6.5 w-6.5 shrink-0 rounded-md bg-primary/24 text-primary-3">
          <span class="i-lucide-sparkles text-[13px]" />
        </span>
      </div>

      <div v-if="showCustomWindowButtons" class="app-titlebar-no-drag flex items-center gap-1">
        <AppButton
          class="app-titlebar-no-drag h-7 min-w-8 px-2"
          size="icon"
          aria-label="Minimize window"
          @click="minimizeWindow"
        >
          <span class="i-lucide-minus text-sm" />
        </AppButton>
        <AppButton
          class="app-titlebar-no-drag h-7 min-w-8 px-2"
          size="icon"
          :aria-label="isMaximized ? 'Restore window' : 'Maximize window'"
          @click="toggleMaximizeWindow"
        >
          <span :class="isMaximized ? 'i-lucide-copy' : 'i-lucide-square'" class="text-[11px]" />
        </AppButton>
        <AppButton
          class="app-titlebar-no-drag h-7 min-w-8 px-2 !border-transparent"
          size="icon"
          variant="danger"
          aria-label="Close window"
          @click="closeWindow"
        >
          <span class="i-lucide-x text-sm" />
        </AppButton>
      </div>
    </div>
  </header>
</template>
