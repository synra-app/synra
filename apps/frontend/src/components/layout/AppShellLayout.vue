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
  <div class="relative flex h-dvh flex-col overflow-hidden text-slate-100">
    <AppTopbar class="shrink-0" :title="appTitle" @toggle-mobile="emit('toggleMobile')" />
    <div
      class="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-hidden px-2 pb-2 pt-2 lg:grid-cols-[260px_1fr] lg:gap-3 lg:px-3 lg:pb-3 lg:pt-3"
    >
      <ScrollContainer
        as="aside"
        class="fixed bottom-2 left-2 top-12 z-50 w-[min(260px,84vw)] -translate-x-[105%] rounded-2xl bg-[#0f172acc] backdrop-blur-xl transition-transform duration-300 ease-in-out lg:static lg:top-auto lg:h-full lg:w-auto lg:translate-x-0 lg:bg-white/4"
        viewport-class="h-full p-2.5"
        :class="mobileOpen ? 'translate-x-0' : ''"
      >
        <slot name="sidebar" />
      </ScrollContainer>
      <button
        v-if="mobileOpen"
        class="fixed inset-0 z-40 bg-black/55 lg:hidden"
        aria-label="Close menu overlay"
        @click="emit('closeMobile')"
      />
      <ScrollContainer
        as="main"
        class="glass-panel min-h-0 min-w-0"
        viewport-class="h-full p-4 md:p-5"
      >
        <div class="mx-auto w-full max-w-[1400px]">
          <slot />
        </div>
      </ScrollContainer>
    </div>
  </div>
</template>
