import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
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

  const manualTarget = ref('')
  const socketPort = ref(32100)
  const connectInFlight = ref(false)
  const removeDialogOpen = ref(false)
  const removeDialogMessage = ref('')
  const removeDialogResolver = ref<((confirmed: boolean) => void) | null>(null)

  const statusLabel = computed(() => (scanState.value === 'scanning' ? 'Scanning' : 'Idle'))
  const connectableDevices = computed(() =>
    [...devices.value]
      .filter((device) => typeof device.ipAddress === 'string' && device.ipAddress.length > 0)
      .sort((left, right) => Number(Boolean(right.connectable)) - Number(Boolean(left.connectable)))
  )
  const connectedDevice = computed(() => {
    if (sessionState.value.state !== 'open' || !sessionState.value.deviceId) {
      return null
    }

    return devices.value.find((device) => device.deviceId === sessionState.value.deviceId) ?? null
  })

  const activeConnections = computed(() => {
    const openSessions = connectedSessions.value.filter((session) => session.status === 'open')
    const byDeviceKey = new Map<string, (typeof openSessions)[number]>()

    for (const session of openSessions) {
      const host = typeof session.host === 'string' ? session.host : undefined
      const port = typeof session.port === 'number' ? session.port : undefined
      const hasEndpoint = Boolean(host && Number.isFinite(port))
      const declaredDeviceId =
        typeof session.deviceId === 'string' && session.deviceId.length > 0
          ? session.deviceId
          : undefined
      const matchedDevice = host
        ? devices.value.find((device) => device.ipAddress === host)
        : undefined
      // 优先使用发现列表中的 deviceId，避免同一设备出现“临时ID + UUID”双重标识。
      const resolvedDeviceId = matchedDevice?.deviceId ?? declaredDeviceId

      // Connect Devices 面板只展示可识别对端设备，过滤掉探测/握手产生的临时会话。
      if (!resolvedDeviceId || !hasEndpoint) {
        continue
      }

      const normalizedSession = {
        ...session,
        deviceId: resolvedDeviceId
      }
      // 同一 host 视为同一设备，防止 inbound/outbound 因 deviceId 不一致而重复展示。
      const key = host ?? resolvedDeviceId
      const existing = byDeviceKey.get(key)
      if (!existing) {
        byDeviceKey.set(key, normalizedSession)
        continue
      }

      const existingActiveAt = typeof existing.lastActiveAt === 'number' ? existing.lastActiveAt : 0
      const nextActiveAt =
        typeof normalizedSession.lastActiveAt === 'number' ? normalizedSession.lastActiveAt : 0
      const existingDirection =
        (existing as { direction?: unknown }).direction === 'outbound' ? 'outbound' : 'inbound'
      const nextDirection =
        (normalizedSession as { direction?: unknown }).direction === 'outbound'
          ? 'outbound'
          : 'inbound'

      // 同设备存在多条会话时，保留最近活跃且优先 outbound 的稳定链路。
      const existingOutbound = existingDirection === 'outbound'
      const nextOutbound = nextDirection === 'outbound'
      if (nextOutbound && !existingOutbound) {
        byDeviceKey.set(key, normalizedSession)
        continue
      }
      if (nextActiveAt >= existingActiveAt) {
        byDeviceKey.set(key, normalizedSession)
      }
    }

    return [...byDeviceKey.values()].sort((left, right) => {
      const leftActiveAt = typeof left.lastActiveAt === 'number' ? left.lastActiveAt : 0
      const rightActiveAt = typeof right.lastActiveAt === 'number' ? right.lastActiveAt : 0
      return rightActiveAt - leftActiveAt
    })
  })
  const connectedDeviceIds = computed(() =>
    activeConnections.value
      .map((session) => session.deviceId)
      .filter((deviceId): deviceId is string => typeof deviceId === 'string' && deviceId.length > 0)
  )
  const isRemoveDialogOpen = computed(() => removeDialogOpen.value)

  function askRemoveConfirmation(message: string): Promise<boolean> {
    removeDialogMessage.value = message
    removeDialogOpen.value = true
    return new Promise<boolean>((resolve) => {
      removeDialogResolver.value = resolve
    })
  }

  function resolveRemoveDialog(confirmed: boolean): void {
    const resolve = removeDialogResolver.value
    removeDialogResolver.value = null
    removeDialogOpen.value = false
    removeDialogMessage.value = ''
    resolve?.(confirmed)
  }

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
