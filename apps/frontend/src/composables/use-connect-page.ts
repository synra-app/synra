import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { buildActiveConnections } from './build-active-connections'
import { useConfirmDialog } from './use-confirm-dialog'
import { openPluginPage } from '../plugins/host'
import { useLanDiscoveryStore } from '../stores/lan-discovery'

function parseManualTargets(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

export function useConnectPage() {
  const router = useRouter()
  const store = useLanDiscoveryStore()
  const {
    scanState,
    startedAt,
    scanWindowMs,
    devices,
    loading,
    error,
    sessionState,
    connectedSessions,
    reconnectTasks
  } = storeToRefs(store)

  const {
    dialogMessage: removeDialogMessage,
    isDialogOpen: isRemoveDialogOpen,
    askConfirmation: askRemoveConfirmation,
    resolveDialog: resolveRemoveDialog
  } = useConfirmDialog()

  const manualTarget = ref('')
  const socketPort = ref(32100)
  const connectInFlight = ref(false)

  const statusLabel = computed(() => (scanState.value === 'scanning' ? 'Scanning' : 'Idle'))
  const connectableDevices = computed(() =>
    [...devices.value]
      .filter(
        (device) =>
          typeof device.ipAddress === 'string' &&
          device.ipAddress.length > 0 &&
          Boolean(device.connectable)
      )
      .sort((left, right) => right.lastSeenAt - left.lastSeenAt)
  )
  const connectedDevice = computed(() => {
    if (sessionState.value.state !== 'open' || !sessionState.value.deviceId) {
      return null
    }

    return devices.value.find((device) => device.deviceId === sessionState.value.deviceId) ?? null
  })

  const activeConnections = computed(() =>
    buildActiveConnections(devices.value, connectedSessions.value)
  )

  const connectedDeviceIds = computed(() =>
    activeConnections.value
      .map((session) => session.deviceId)
      .filter((deviceId): deviceId is string => typeof deviceId === 'string' && deviceId.length > 0)
  )

  async function onStartDiscovery(): Promise<void> {
    // Avoid iOS keyboard (TUI*) constraint noise when inputs still have focus.
    const active = document.activeElement
    if (active instanceof HTMLElement) {
      active.blur()
    }
    await store.startDiscovery(parseManualTargets(manualTarget.value))
  }

  async function onStopDiscovery(): Promise<void> {
    await store.stopDiscovery()
  }

  async function onRefreshDiscovery(): Promise<void> {
    await store.refreshDevices()
  }

  async function onConnect(deviceId: string): Promise<void> {
    const selectedDevice = devices.value.find((device) => device.deviceId === deviceId)
    if (!selectedDevice || loading.value || connectInFlight.value) {
      return
    }
    if (sessionState.value.state === 'open') {
      return
    }
    if (typeof selectedDevice.ipAddress !== 'string' || selectedDevice.ipAddress.length === 0) {
      return
    }
    connectInFlight.value = true
    try {
      await store.openSession({
        deviceId: selectedDevice.deviceId,
        host: selectedDevice.ipAddress,
        port: socketPort.value
      })
    } finally {
      connectInFlight.value = false
    }
  }

  async function onDisconnect(deviceId: string): Promise<void> {
    const targetSession =
      activeConnections.value.find((session) => session.deviceId === deviceId) ??
      (sessionState.value.sessionId ? { sessionId: sessionState.value.sessionId } : undefined)
    if (!targetSession?.sessionId) {
      return
    }
    await store.closeSession(targetSession.sessionId)
  }

  async function onDisconnectSession(sessionId: string): Promise<void> {
    if (!sessionId) {
      return
    }
    await store.closeSession(sessionId)
  }

  async function onRemoveDevice(deviceId: string): Promise<void> {
    const targetDevice = devices.value.find((device) => device.deviceId === deviceId)
    const targetLabel = targetDevice?.name ?? deviceId
    const confirmed = await askRemoveConfirmation(
      `Remove device "${targetLabel}" from the current list?`
    )
    if (!confirmed) {
      return
    }
    await onDisconnect(deviceId)
    devices.value = devices.value.filter((device) => device.deviceId !== deviceId)
  }

  function onConfirmRemoveDevice(): void {
    resolveRemoveDialog(true)
  }

  function onCancelRemoveDevice(): void {
    resolveRemoveDialog(false)
  }

  function openMessagePage(sessionId: string): void {
    void openPluginPage(router, 'chat', '/home', { sessionId })
  }

  onMounted(async () => {
    await store.ensureListeners()
    await store.refreshDevices()
  })

  return {
    activeConnections,
    connectableDevices,
    connectedDevice,
    connectedDeviceIds,
    error,
    isRemoveDialogOpen,
    loading,
    manualTarget,
    onConnect,
    onCancelRemoveDevice,
    onConfirmRemoveDevice,
    onDisconnect,
    onDisconnectSession,
    onRemoveDevice,
    onRefreshDiscovery,
    onStartDiscovery,
    onStopDiscovery,
    openMessagePage,
    scanWindowMs,
    reconnectTasks,
    removeDialogMessage,
    sessionState,
    socketPort,
    startedAt,
    statusLabel
  }
}
