<script setup lang="ts">
import AppButton from '../base/AppButton.vue'

const keyword = defineModel<string>('keyword', { required: true })

defineProps<{
  loading: boolean
  placeholder?: string
}>()

const emit = defineEmits<{
  search: []
  localInstall: []
}>()
</script>

<template>
  <div class="flex flex-col gap-2 md:flex-row">
    <input
      v-model="keyword"
      class="app-focus-ring w-full rounded-lg border border-white/15 bg-white/6 px-3 py-2 text-sm text-slate-100 placeholder:text-muted-4"
      :placeholder="placeholder ?? 'Search plugin package (name or slug)'"
      @keyup.enter="emit('search')"
    />
    <div class="flex items-center gap-2">
      <AppButton :disabled="loading" @click="emit('search')"> Refresh </AppButton>
      <AppButton
        size="icon"
        :disabled="loading"
        title="Install local plugin"
        @click="emit('localInstall')"
      >
        <span class="i-lucide-folder-plus h-4 w-4" />
      </AppButton>
    </div>
  </div>
</template>
