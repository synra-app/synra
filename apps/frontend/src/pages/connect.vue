<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useLanDiscoveryStore } from "../stores/lan-discovery";

const router = useRouter();
const store = useLanDiscoveryStore();
const {
  scanState,
  startedAt,
  scanWindowMs,
  devices,
  loading,
  error,
  sessionState,
  connectedSessions,
} = storeToRefs(store);
const manualTarget = ref("");
const selectedDeviceId = ref<string>("");
const socketPort = ref(32100);

const statusLabel = computed(() => (scanState.value === "scanning" ? "Scanning" : "Idle"));
const selectedDevice = computed(() =>
  devices.value.find((device) => device.deviceId === selectedDeviceId.value),
);
const connectableDevices = computed(() => devices.value.filter((device) => device.connectable));
const connectedDevice = computed(() => {
  if (!sessionState.value.deviceId) {
    return null;
  }

  return devices.value.find((device) => device.deviceId === sessionState.value.deviceId) ?? null;
});
const canConnect = computed(
  () =>
    Boolean(selectedDevice.value) &&
    Boolean(selectedDevice.value?.connectable) &&
    selectedDevice.value?.paired &&
    sessionState.value.state !== "open" &&
    !loading.value,
);
const activeConnections = computed(() =>
  connectedSessions.value.filter((session) => session.status === "open"),
);

function parseManualTargets(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

async function onStartDiscovery(): Promise<void> {
  await store.startDiscovery(parseManualTargets(manualTarget.value));
}

async function onStopDiscovery(): Promise<void> {
  await store.stopDiscovery();
}

async function onRefreshDiscovery(): Promise<void> {
  await store.refreshDevices();
}

async function onPairDevice(deviceId: string): Promise<void> {
  await store.pairDevice(deviceId);
}

async function onConnect(): Promise<void> {
  if (!selectedDevice.value) {
    return;
  }
  if (!canConnect.value) {
    return;
  }
  await store.openSession({
    deviceId: selectedDevice.value.deviceId,
    host: selectedDevice.value.ipAddress,
    port: socketPort.value,
  });
  await store.syncSessionState();
}

async function onDisconnect(): Promise<void> {
  await store.closeSession(sessionState.value.sessionId);
}

function openMessagePage(sessionId: string): void {
  void router.push({
    path: "/messages",
    query: { sessionId },
  });
}

onMounted(async () => {
  await store.ensureListeners();
  await store.refreshDevices();
});
</script>

<template>
  <section class="space-y-4">
    <div class="rounded-lg border border-gray-200 bg-white p-4 text-sm space-y-2">
      <h1 class="text-lg font-semibold">LAN Connection</h1>
      <p><strong>Scan Status:</strong> {{ statusLabel }}</p>
      <p><strong>Scan Window:</strong> {{ scanWindowMs }} ms</p>
      <p><strong>Started At:</strong> {{ startedAt ?? "-" }}</p>
      <p>
        <strong>Connected Device:</strong>
        {{ connectedDevice ? `${connectedDevice.name} (${connectedDevice.ipAddress})` : "None" }}
      </p>
      <p><strong>Socket Port:</strong> {{ socketPort }}</p>
      <p><strong>Session State:</strong> {{ sessionState.state }}</p>
      <p><strong>Session ID:</strong> {{ sessionState.sessionId ?? "-" }}</p>
    </div>

    <div class="rounded-lg border border-gray-200 bg-white p-4 text-sm space-y-3">
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
          @click="onStartDiscovery"
        >
          Start Scan
        </button>
        <button
          class="rounded-md border border-gray-300 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="loading"
          @click="onStopDiscovery"
        >
          Stop Scan
        </button>
        <button
          class="rounded-md border border-gray-300 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="loading"
          @click="onRefreshDiscovery"
        >
          Refresh
        </button>
      </div>
      <p v-if="error" class="text-red-600">{{ error }}</p>
    </div>

    <div class="rounded-lg border border-gray-200 bg-white p-4 text-sm space-y-3">
      <h2 class="text-base font-semibold">Discovered Devices</h2>
      <ul v-if="connectableDevices.length > 0" class="space-y-3">
        <li
          v-for="device in connectableDevices"
          :key="device.deviceId"
          class="rounded-md border border-gray-200 p-3"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="space-y-1">
              <p class="font-semibold">{{ device.name }}</p>
              <p class="text-gray-600">{{ device.ipAddress }}</p>
              <p class="text-gray-500">
                Source: {{ device.source }} | Last Seen: {{ device.lastSeenAt }}
              </p>
              <p class="text-xs" :class="device.connectable ? 'text-green-700' : 'text-amber-700'">
                Connectable:
                {{
                  device.connectable
                    ? "yes"
                    : `no${device.connectCheckError ? ` (${device.connectCheckError})` : ""}`
                }}
              </p>
              <label class="inline-flex items-center gap-2 text-gray-700">
                <input
                  v-model="selectedDeviceId"
                  type="radio"
                  name="selectedDevice"
                  :value="device.deviceId"
                />
                Select for connection
              </label>
            </div>
            <button
              class="rounded-md border border-gray-300 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="loading || device.paired"
              @click="onPairDevice(device.deviceId)"
            >
              {{ device.paired ? "Paired" : "Pair" }}
            </button>
          </div>
        </li>
      </ul>
      <p v-else class="text-gray-600">No connectable Synra devices found yet.</p>
      <div class="flex flex-wrap gap-2 pt-1">
        <button
          class="rounded-md bg-gray-900 px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!canConnect"
          @click="onConnect"
        >
          Connect Selected
        </button>
        <button
          class="rounded-md border border-gray-300 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!connectedDevice"
          @click="onDisconnect"
        >
          Disconnect
        </button>
      </div>
    </div>

    <div class="rounded-lg border border-gray-200 bg-white p-4 text-sm space-y-3">
      <h2 class="text-base font-semibold">Connected Devices</h2>
      <ul v-if="activeConnections.length > 0" class="space-y-3">
        <li
          v-for="session in activeConnections"
          :key="session.sessionId"
          class="rounded-md border border-gray-200 p-3"
        >
          <div class="flex items-center justify-between gap-2">
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
              class="rounded-md bg-gray-900 px-3 py-2 text-white"
              @click="openMessagePage(session.sessionId)"
            >
              Open Messages
            </button>
          </div>
        </li>
      </ul>
      <p v-else class="text-gray-600">No active sessions yet.</p>
      <p class="text-gray-500">
        Message sending has moved to the dedicated <code>/messages</code> page.
      </p>
    </div>
  </section>
</template>
