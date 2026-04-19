<script setup lang="ts">
defineProps<{
  mobileOpen: boolean
}>()

const emit = defineEmits<{
  closeMobile: []
}>()
</script>

<template>
  <div class="flex h-screen flex-col overflow-hidden bg-surface-1 text-slate-900">
    <div class="shrink-0 border-b border-surface-3 bg-surface px-4 py-3 lg:hidden">
      <slot name="mobile-trigger" />
    </div>
    <div class="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[auto_1fr]">
      <aside
        class="fixed inset-y-0 left-0 z-40 w-72 -translate-x-full overflow-y-auto border-r border-surface-3 bg-surface transition-transform duration-200 ease-in-out lg:static lg:h-full lg:translate-x-0"
        :class="mobileOpen ? 'translate-x-0' : ''"
      >
        <slot name="sidebar" />
      </aside>
      <button
        v-if="mobileOpen"
        class="fixed inset-0 z-30 bg-black/30 lg:hidden"
        aria-label="Close menu overlay"
        @click="emit('closeMobile')"
      />
      <main class="min-w-0 overflow-y-auto p-4 sm:p-6">
        <slot />
      </main>
    </div>
  </div>
</template>
