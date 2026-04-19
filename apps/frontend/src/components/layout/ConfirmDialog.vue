<script setup lang="ts">
import AppButton from '../base/AppButton.vue'

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
  <div
    v-if="visible"
    class="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm"
  >
    <div
      class="w-full max-w-md rounded-2xl border border-white/14 bg-slate-950/92 p-5 shadow-2xl shadow-black/50"
    >
      <h3 class="text-lg font-semibold text-slate-100">{{ title }}</h3>
      <p class="mt-2 text-sm text-muted-2">{{ message }}</p>
      <div class="mt-4 flex justify-end gap-2">
        <AppButton @click="emit('cancel')">
          {{ cancelText ?? 'Cancel' }}
        </AppButton>
        <AppButton variant="danger" @click="emit('confirm')">
          {{ confirmText ?? 'Confirm' }}
        </AppButton>
      </div>
    </div>
  </div>
</template>
