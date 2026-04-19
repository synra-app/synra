<script setup lang="ts">
import type { SessionLogEntry } from '../../types/session-log'

defineProps<{
  entries: SessionLogEntry[]
}>()
</script>

<template>
  <PanelCard title="Session Logs">
    <ul v-if="entries.length > 0" class="max-h-64 space-y-2 overflow-auto">
      <li
        v-for="log in entries"
        :key="log.id"
        class="rounded-lg border px-3 py-2"
        :class="
          log.type === 'transportError'
            ? 'border-error/35 bg-error/12 text-error-3'
            : log.type === 'messageAck' || log.type === 'sessionOpened'
              ? 'border-success/35 bg-success/12 text-success-3'
              : 'border-white/12 bg-white/6 text-muted-1'
        "
      >
        <p>
          {{ new Date(log.timestamp).toLocaleTimeString() }} - {{ log.type }}:
          {{ JSON.stringify(log.payload) }}
        </p>
      </li>
    </ul>
    <p v-else class="text-muted-3">No logs for selected session.</p>
  </PanelCard>
</template>
