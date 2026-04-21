import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useLanDiscoveryStore } from '../stores/lan-discovery'

function isIpv4Address(value: string | undefined): boolean {
  if (typeof value !== 'string') {
    return false
  }
  const segments = value.trim().split('.')
  if (segments.length !== 4) {
    return false
  }
  return segments.every(
    (segment) => /^\d{1,3}$/.test(segment) && Number(segment) >= 0 && Number(segment) <= 255
  )
}

export function useConnectPage() {
  const store = useLanDiscoveryStore()
  const { scanState, peers, connectedDeviceIds, loading, error } = storeToRefs(store)
  const pendingDeviceActionIds = ref<string[]>([])
  function isDeviceActionPending(deviceId: string): boolean {
    return pendingDeviceActionIds.value.includes(deviceId)
  }

  function addPendingDeviceAction(deviceId: string): void {
    if (!isDeviceActionPending(deviceId)) {
      pendingDeviceActionIds.value = [...pendingDeviceActionIds.value, deviceId]
    }
  }

  function removePendingDeviceAction(deviceId: string): void {
    pendingDeviceActionIds.value = pendingDeviceActionIds.value.filter((id) => id !== deviceId)
  }

  const connectableDevices = computed(() =>
    peers.value
      .filter((device) => isIpv4Address(device.ipAddress))
      .map((device) => ({
        deviceId: device.deviceId,
        name: device.name,
        ipAddress: device.ipAddress,
        port: device.port,
        source: device.source ?? 'probe',
        connectable: device.connectable,
        discoveredAt: device.lastSeenAt ?? Date.now(),
        lastSeenAt: device.lastSeenAt ?? Date.now()
      }))
      .sort((left, right) => right.lastSeenAt - left.lastSeenAt)
  )

  async function onScanDiscovery(): Promise<void> {
    await store.startScan()
  }

  async function onConnect(deviceId: string): Promise<void> {
    if (isDeviceActionPending(deviceId) || loading.value) {
      return
    }
    addPendingDeviceAction(deviceId)
    try {
      await store.connectToDevice(deviceId)
    } finally {
      removePendingDeviceAction(deviceId)
    }
  }

  async function onDisconnect(deviceId: string): Promise<void> {
    if (isDeviceActionPending(deviceId)) {
      return
    }
    addPendingDeviceAction(deviceId)
    try {
      await store.disconnectDevice(deviceId)
    } finally {
      removePendingDeviceAction(deviceId)
    }
  }

  onMounted(async () => {
    await store.ensureReady()
  })

  return {
    connectableDevices,
    connectedDeviceIds,
    error,
    loading,
    onConnect,
    onDisconnect,
    onScanDiscovery,
    pendingDeviceActionIds,
    scanState
  }
}
