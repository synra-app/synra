<script setup lang="ts">
defineProps<{
  title?: string
  description?: string
}>()
</script>

<template>
  <section class="glass-panel-soft space-y-3 rounded-xl p-4 text-sm ring-1 ring-white/10 md:p-5">
    <header v-if="title || description" class="space-y-1">
      <h2 v-if="title" class="text-base font-semibold text-slate-100">{{ title }}</h2>
      <p v-if="description" class="text-sm text-slate-300">{{ description }}</p>
    </header>
    <slot />
  </section>
</template>
