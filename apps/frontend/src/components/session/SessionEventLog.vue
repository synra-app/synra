<script setup lang="ts">
import type { SessionLogEntry } from "../../types/session-log";

defineProps<{
  entries: SessionLogEntry[];
}>();
</script>

<template>
  <PanelCard title="Session Logs">
    <ul v-if="entries.length > 0" class="max-h-64 space-y-2 overflow-auto">
      <li
        v-for="log in entries"
        :key="log.id"
        class="rounded-md border px-3 py-2"
        :class="
          log.type === 'transportError'
            ? 'border-red-200 bg-red-50 text-red-700'
            : log.type === 'messageAck' || log.type === 'sessionOpened'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-gray-200 bg-gray-50 text-gray-700'
        "
      >
        <p>
          {{ new Date(log.timestamp).toLocaleTimeString() }} - {{ log.type }}:
          {{ JSON.stringify(log.payload) }}
        </p>
      </li>
    </ul>
    <p v-else class="text-gray-600">No logs for selected session.</p>
  </PanelCard>
</template>
