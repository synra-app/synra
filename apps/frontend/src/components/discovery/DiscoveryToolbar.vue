<script setup lang="ts">
const manualTarget = defineModel<string>('manualTarget', { required: true })
const socketPort = defineModel<number>('socketPort', { required: true })

defineProps<{
  loading: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  start: []
  stop: []
  refresh: []
}>()
</script>

<template>
  <PanelCard title="Discovery Controls">
    <label class="block">
      <span class="mb-1 block font-semibold">Manual Targets (comma separated)</span>
      <input
        v-model="manualTarget"
        class="w-full rounded-md border border-gray-300 px-3 py-2"
        placeholder="192.168.1.100,192.168.1.101"
      />
    </label>
    <label class="block">
      <span class="mb-1 block font-semibold">WebSocket Port</span>
      <input
        v-model.number="socketPort"
        class="w-full rounded-md border border-gray-300 px-3 py-2"
        type="number"
        min="1"
        max="65535"
        placeholder="32100"
      />
    </label>
    <div class="flex flex-wrap gap-2">
      <button
        class="rounded-md bg-gray-900 px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="loading"
        @click="emit('start')"
      >
        Start Scan
      </button>
      <button
        class="rounded-md border border-gray-300 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="loading"
        @click="emit('stop')"
      >
        Stop Scan
      </button>
      <button
        class="rounded-md border border-gray-300 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="loading"
        @click="emit('refresh')"
      >
        Refresh
      </button>
    </div>
    <p v-if="error" class="text-red-600">{{ error }}</p>
  </PanelCard>
</template>
