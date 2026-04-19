<script setup lang="ts">
import ScrollContainer from '../base/ScrollContainer.vue'

defineProps<{
  mobileOpen: boolean
  appTitle?: string
}>()

const emit = defineEmits<{
  closeMobile: []
  toggleMobile: []
}>()
</script>

<template>
  <div class="app-shell relative flex h-dvh flex-col overflow-hidden text-slate-100">
    <AppTopbar
      class="app-shell-topbar shrink-0"
      :title="appTitle"
      @toggle-mobile="emit('toggleMobile')"
    />
    <div
      class="app-shell-body flex min-h-0 flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-[260px_1fr] lg:gap-3 lg:px-3 lg:pb-3 lg:pt-3"
    >
      <aside class="app-shell-sidebar app-shell-sidebar-desktop hidden min-h-0 lg:block">
        <ScrollContainer
          as="div"
          class="app-shell-sidebar-scroll h-full rounded-2xl bg-white/4"
          viewport-class="h-full p-2.5"
        >
          <slot name="sidebar" />
        </ScrollContainer>
      </aside>
      <ScrollContainer
        as="main"
        class="app-shell-content min-h-0 min-w-0 flex-1 lg:h-full lg:glass-panel"
        viewport-class="h-full p-4 md:p-5"
      >
        <div class="app-shell-content-inner mx-auto w-full max-w-[1400px]">
          <slot />
        </div>
      </ScrollContainer>
    </div>
    <aside
      class="app-shell-sidebar app-shell-sidebar-mobile fixed inset-y-0 left-0 z-[70] w-[min(280px,86vw)] border-r border-white/10 bg-[#0f172af2] shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-in-out lg:hidden"
      :class="mobileOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <ScrollContainer
        as="div"
        class="app-shell-sidebar-scroll h-full"
        viewport-class="h-full p-3 pt-4"
      >
        <slot name="sidebar" />
      </ScrollContainer>
    </aside>
    <button
      v-if="mobileOpen"
      class="app-shell-overlay fixed inset-0 z-[65] bg-black/55 lg:hidden"
      aria-label="Close menu overlay"
      @click="emit('closeMobile')"
    />
  </div>
</template>
