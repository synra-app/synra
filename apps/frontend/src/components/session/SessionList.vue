<script setup lang="ts">
import type { ConnectedSession } from '../../stores/lan-discovery'
import AppButton from '../base/AppButton.vue'

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
        class="rounded-xl border border-white/12 bg-white/5 p-3"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="space-y-1">
            <p class="font-semibold text-slate-100">
              {{ session.deviceId ?? session.remote ?? session.sessionId }}
            </p>
            <p class="text-muted-2">Session: {{ session.sessionId }}</p>
            <p class="text-muted-2">
              Endpoint:
              {{
                session.host
                  ? `${session.host}${typeof session.port === 'number' ? `:${session.port}` : ''}`
                  : (session.remote ?? '-')
              }}
            </p>
            <p class="text-muted-3">
              Direction:
              <span
                class="rounded px-1.5 py-0.5 text-xs"
                :class="
                  session.direction === 'inbound'
                    ? 'bg-info/18 text-info-4'
                    : 'bg-success/18 text-success-4'
                "
              >
                {{ session.direction ?? 'outbound' }}
              </span>
              | Last Active: {{ session.lastActiveAt }}
            </p>
          </div>
          <AppButton
            v-if="mode === 'connect'"
            variant="solid"
            @click="emit('openMessages', session.sessionId)"
          >
            Open Messages
          </AppButton>
          <AppButton v-if="mode === 'connect'" @click="emit('disconnect', session.sessionId)">
            Disconnect
          </AppButton>
          <AppButton
            v-else
            size="sm"
            :class="
              selectedSessionId === session.sessionId
                ? 'border-primary-4/35 bg-primary/24 text-slate-100'
                : ''
            "
            @click="emit('select', session.sessionId)"
          >
            {{ selectedSessionId === session.sessionId ? 'Selected' : 'Open' }}
          </AppButton>
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
