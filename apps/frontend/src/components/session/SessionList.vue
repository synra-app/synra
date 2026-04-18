<script setup lang="ts">
import type { ConnectedSession } from "../../stores/lan-discovery";

defineProps<{
  sessions: ConnectedSession[];
  selectedSessionId?: string;
  mode: "connect" | "messages";
}>();

const emit = defineEmits<{
  select: [sessionId: string];
  openMessages: [sessionId: string];
}>();
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
            <p class="text-gray-600">Session: {{ session.sessionId }}</p>
            <p class="text-gray-500">
              Direction: {{ session.direction }} | Last Active: {{ session.lastActiveAt }}
            </p>
          </div>
          <button
            v-if="mode === 'connect'"
            class="rounded-md bg-gray-900 px-3 py-2 text-white"
            @click="emit('openMessages', session.sessionId)"
          >
            Open Messages
          </button>
          <button
            v-else
            class="rounded-md px-3 py-2 text-sm"
            :class="
              selectedSessionId === session.sessionId
                ? 'bg-gray-900 text-white'
                : 'border border-gray-300 bg-white text-gray-700'
            "
            @click="emit('select', session.sessionId)"
          >
            {{ selectedSessionId === session.sessionId ? "Selected" : "Open" }}
          </button>
        </div>
      </li>
    </ul>
    <p v-else class="text-gray-600">
      {{
        mode === "connect"
          ? "No active sessions yet."
          : "No active session. Go to Connection page first."
      }}
    </p>
  </PanelCard>
</template>
