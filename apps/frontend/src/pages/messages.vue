<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useLanDiscoveryStore } from "../stores/lan-discovery";

type LogEntry = {
  id: string;
  type:
    | "sessionOpened"
    | "sessionClosed"
    | "messageSent"
    | "messageReceived"
    | "messageAck"
    | "hostEvent"
    | "transportError";
  payload: unknown;
  timestamp: number;
};

const route = useRoute();
const router = useRouter();
const store = useLanDiscoveryStore();
const { connectedSessions, eventLogs, loading, error } = storeToRefs(store);

const selectedSessionId = ref<string>("");
const messageInput = ref("");
const messageType = ref("chat.text");

const activeSessions = computed(() =>
  connectedSessions.value.filter((item) => item.status === "open"),
);
const selectedSession = computed(() =>
  activeSessions.value.find((item) => item.sessionId === selectedSessionId.value),
);
const canSend = computed(
  () =>
    Boolean(selectedSession.value?.sessionId) &&
    messageInput.value.trim().length > 0 &&
    !loading.value,
);

function toStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getPayloadSessionId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const candidate = payload as { sessionId?: unknown };
  return toStringValue(candidate.sessionId);
}

const sessionLogs = computed<LogEntry[]>(() => {
  if (!selectedSessionId.value) {
    return [];
  }
  return eventLogs.value.filter(
    (entry) => getPayloadSessionId(entry.payload) === selectedSessionId.value,
  );
});

function syncSelectedSessionFromRoute(): void {
  const querySessionId = route.query.sessionId;
  const resolved = Array.isArray(querySessionId) ? querySessionId[0] : querySessionId;
  const normalized = toStringValue(resolved);
  if (normalized) {
    selectedSessionId.value = normalized;
    return;
  }
  selectedSessionId.value = activeSessions.value[0]?.sessionId ?? "";
}

async function onSendMessage(): Promise<void> {
  if (!canSend.value || !selectedSession.value) {
    return;
  }
  const content = messageInput.value.trim();
  messageInput.value = "";
  await store.sendMessage({
    sessionId: selectedSession.value.sessionId,
    type: messageType.value,
    payload: content,
  });
}

function openSession(sessionId: string): void {
  selectedSessionId.value = sessionId;
  void router.replace({
    path: "/messages",
    query: { sessionId },
  });
}

onMounted(async () => {
  await store.ensureListeners();
  syncSelectedSessionFromRoute();
});

watch(
  () => route.query.sessionId,
  () => {
    syncSelectedSessionFromRoute();
  },
);
</script>

<template>
  <section class="space-y-4">
    <div class="rounded-lg border border-gray-200 bg-white p-4 text-sm space-y-2">
      <h1 class="text-lg font-semibold">Messages</h1>
      <p><strong>Active Session:</strong> {{ selectedSessionId || "-" }}</p>
      <p><strong>Status:</strong> {{ selectedSession?.status ?? "idle" }}</p>
      <p><strong>Remote:</strong> {{ selectedSession?.remote ?? "-" }}</p>
      <p><strong>Direction:</strong> {{ selectedSession?.direction ?? "-" }}</p>
      <p v-if="error" class="text-red-600">{{ error }}</p>
    </div>

    <div class="rounded-lg border border-gray-200 bg-white p-4 text-sm space-y-3">
      <h2 class="text-base font-semibold">Connected Sessions</h2>
      <ul v-if="activeSessions.length > 0" class="space-y-2">
        <li
          v-for="session in activeSessions"
          :key="session.sessionId"
          class="rounded-md border border-gray-200 p-3"
        >
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="font-semibold">
                {{ session.deviceId ?? session.remote ?? session.sessionId }}
              </p>
              <p class="text-gray-600">{{ session.sessionId }}</p>
            </div>
            <button
              class="rounded-md px-3 py-2 text-sm"
              :class="
                selectedSessionId === session.sessionId
                  ? 'bg-gray-900 text-white'
                  : 'border border-gray-300 bg-white text-gray-700'
              "
              @click="openSession(session.sessionId)"
            >
              {{ selectedSessionId === session.sessionId ? "Selected" : "Open" }}
            </button>
          </div>
        </li>
      </ul>
      <p v-else class="text-gray-600">No active session. Go to Connection page first.</p>
    </div>

    <div class="rounded-lg border border-gray-200 bg-white p-4 text-sm space-y-3">
      <h2 class="text-base font-semibold">Send Message</h2>
      <div class="flex gap-2">
        <input
          v-model="messageInput"
          class="w-full rounded-md border border-gray-300 px-3 py-2"
          :disabled="!selectedSession || loading"
          placeholder="Type a message..."
          @keyup.enter="onSendMessage"
        />
        <input
          v-model="messageType"
          class="w-40 rounded-md border border-gray-300 px-3 py-2"
          :disabled="!selectedSession || loading"
          placeholder="message type"
        />
        <button
          class="rounded-md bg-gray-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!canSend"
          @click="onSendMessage"
        >
          Send
        </button>
      </div>
    </div>

    <div class="rounded-lg border border-gray-200 bg-white p-4 text-sm space-y-3">
      <h2 class="text-base font-semibold">Session Logs</h2>
      <ul v-if="sessionLogs.length > 0" class="max-h-64 space-y-2 overflow-auto">
        <li
          v-for="log in sessionLogs"
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
    </div>
  </section>
</template>
