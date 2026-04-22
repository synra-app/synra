<script setup lang="ts">
const props = defineProps<{
  name: string
  activeName: string
}>()

const isActive = computed(() => props.name === props.activeName)
</script>

<template>
  <div v-show="isActive" role="tabpanel" :aria-hidden="!isActive">
    <slot v-if="isActive" />
  </div>
</template>
