<script setup lang="ts">
import type { ConnectedSession } from '../../stores/lan-discovery'

defineProps<{
  sessions: ConnectedSession[]
  selectedSessionId?: string
  mode: 'connect' | 'messages'
}>()

const emit = defineEmits<{
  select: [sessionId: string]
  openMessages: [sessionId: string]
  disconnect: [sessionId: string]
}>()
</script>

<template>
  <PanelCard :title="mode === 'connect' ? 'Connected Devices' : 'Connected Sessions'">
    <ul v-if="sessions.length > 0" class="space-y-3">
      <li
        v-for="session in sessions"
        :key="session.sessionId"
        class="rounded-md border border-gray-200 p-3"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="space-y-1">
            <p class="font-semibold">
              {{ session.deviceId ?? session.remote ?? session.sessionId }}
            </p>
            <p class="text-muted-6">Session: {{ session.sessionId }}</p>
            <p class="text-muted-6">
              Endpoint:
              {{
                session.host
                  ? `${session.host}${typeof session.port === 'number' ? `:${session.port}` : ''}`
                  : (session.remote ?? '-')
              }}
            </p>
            <p class="text-muted-5">
              Direction:
              <span
                class="rounded px-1.5 py-0.5 text-xs"
                :class="
                  session.direction === 'inbound'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-emerald-100 text-emerald-700'
                "
              >
                {{ session.direction ?? 'outbound' }}
              </span>
              | Last Active: {{ session.lastActiveAt }}
            </p>
          </div>
          <button
            v-if="mode === 'connect'"
            class="rounded-md bg-primary px-3 py-2 text-white"
            @click="emit('openMessages', session.sessionId)"
          >
            Open Messages
          </button>
          <button
            v-if="mode === 'connect'"
            class="rounded-md border border-gray-300 px-3 py-2"
            @click="emit('disconnect', session.sessionId)"
          >
            Disconnect
          </button>
          <button
            v-else
            class="rounded-md px-3 py-2 text-sm"
            :class="
              selectedSessionId === session.sessionId
                ? 'bg-primary text-white'
                : 'border border-surface-5 bg-surface text-muted-6'
            "
            @click="emit('select', session.sessionId)"
          >
            {{ selectedSessionId === session.sessionId ? 'Selected' : 'Open' }}
          </button>
        </div>
      </li>
    </ul>
    <p v-else class="text-muted-5">
      {{
        mode === 'connect'
          ? 'No active sessions yet.'
          : 'No active session. Open a device session first.'
      }}
    </p>
  </PanelCard>
</template>
