<script setup lang="ts">
const keyword = defineModel<string>('keyword', { required: true })

defineProps<{
  loading: boolean
  placeholder?: string
}>()

const emit = defineEmits<{
  search: []
}>()
</script>

<template>
  <div class="flex flex-col gap-2 md:flex-row">
    <input
      v-model="keyword"
      class="w-full rounded-lg border border-surface-5 bg-surface px-3 py-2"
      :placeholder="placeholder ?? 'Search plugins'"
      @keyup.enter="emit('search')"
    />
    <button
      class="rounded-lg border border-surface-5 px-3 py-2 text-sm text-muted-6 disabled:cursor-not-allowed disabled:opacity-60"
      :disabled="loading"
      @click="emit('search')"
    >
      Refresh
    </button>
  </div>
</template>
