<script setup lang="ts">
defineProps<{
  visible: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
    <div class="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
      <h3 class="text-lg font-semibold">{{ title }}</h3>
      <p class="mt-2 text-sm text-gray-600">{{ message }}</p>
      <div class="mt-4 flex justify-end gap-2">
        <button class="rounded-md border border-gray-300 px-3 py-2" @click="emit('cancel')">
          {{ cancelText ?? 'Cancel' }}
        </button>
        <button class="rounded-md bg-red-600 px-3 py-2 text-white" @click="emit('confirm')">
          {{ confirmText ?? 'Confirm' }}
        </button>
      </div>
    </div>
  </div>
</template>
