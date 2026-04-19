<script setup lang="ts">
import AppButton from '../base/AppButton.vue'

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
      class="app-focus-ring w-full rounded-lg border border-white/15 bg-white/6 px-3 py-2 text-sm text-slate-100 placeholder:text-muted-4"
      :placeholder="placeholder ?? 'Search plugins'"
      @keyup.enter="emit('search')"
    />
    <AppButton :disabled="loading" @click="emit('search')"> Refresh </AppButton>
  </div>
</template>
