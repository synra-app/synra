import { storeToRefs } from "pinia";
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useLanDiscoveryStore } from "../stores/lan-discovery";

function parseManualTargets(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function useConnectPage() {
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
    if (!selectedDevice.value || !canConnect.value) {
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

  return {
    activeConnections,
    canConnect,
    connectableDevices,
    connectedDevice,
    error,
    loading,
    manualTarget,
    onConnect,
    onDisconnect,
    onPairDevice,
    onRefreshDiscovery,
    onStartDiscovery,
    onStopDiscovery,
    openMessagePage,
    scanWindowMs,
    selectedDeviceId,
    sessionState,
    socketPort,
    startedAt,
    statusLabel,
  };
}
