<script setup lang="ts">
defineProps<{
  title?: string
  description?: string
}>()
</script>

<template>
  <section class="space-y-3 rounded-lg border border-gray-200 bg-white p-4 text-sm">
    <header v-if="title || description" class="space-y-1">
      <h2 v-if="title" class="text-base font-semibold">{{ title }}</h2>
      <p v-if="description" class="text-gray-600">{{ description }}</p>
    </header>
    <slot />
  </section>
</template>
