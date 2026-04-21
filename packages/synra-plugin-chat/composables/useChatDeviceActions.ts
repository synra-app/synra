import { ref, type ComputedRef, type Ref } from 'vue'
import type { SynraHookDevice } from '@synra/plugin-sdk/hooks'
import type { ChatSession } from '../src/types/chat'

const DEFAULT_SOCKET_PORT = 32100

export function useChatDeviceActions(options: {
  loading: Ref<boolean>
  selectedDevice: ComputedRef<SynraHookDevice | undefined>
  selectedSession: ComputedRef<ChatSession | undefined>
  activeSessions: ComputedRef<ChatSession[]>
  selectedSessionId: Ref<string>
  openSessionByDevice: (input: { deviceId: string; host: string; port: number }) => Promise<void>
  closeSession: (sessionId: string) => Promise<void>
  reconnectDevice: (input: { deviceId: string; host: string; port: number }) => Promise<void>
  syncSessionState: () => Promise<void>
  refreshDevices: () => Promise<void>
  localError: Ref<string | null>
}): {
  connectInFlight: Ref<boolean>
  connectSelectedDevice: () => Promise<void>
  disconnectSelectedSession: () => Promise<void>
  reconnectSelectedDevice: () => Promise<void>
  refreshDeviceDiscovery: () => Promise<void>
} {
  const {
    loading,
    selectedDevice,
    selectedSession,
    activeSessions,
    selectedSessionId,
    openSessionByDevice,
    closeSession,
    reconnectDevice,
    syncSessionState,
    refreshDevices,
    localError
  } = options

  const connectInFlight = ref(false)

  async function connectSelectedDevice(): Promise<void> {
    if (
      !selectedDevice.value ||
      loading.value ||
      connectInFlight.value ||
      !selectedDevice.value.connectable
    ) {
      return
    }
    if (
      typeof selectedDevice.value.ipAddress !== 'string' ||
      selectedDevice.value.ipAddress.length === 0
    ) {
      localError.value = 'Selected device has no valid IP address.'
      return
    }
    localError.value = null
    connectInFlight.value = true
    try {
      await openSessionByDevice({
        deviceId: selectedDevice.value.deviceId,
        host: selectedDevice.value.ipAddress,
        port: DEFAULT_SOCKET_PORT
      })
      await syncSessionState()
      const linkedSession = activeSessions.value.find(
        (session) =>
          session.deviceId === selectedDevice.value?.deviceId && session.status === 'open'
      )
      if (linkedSession?.sessionId) {
        selectedSessionId.value = linkedSession.sessionId
      }
    } finally {
      connectInFlight.value = false
    }
  }

  async function disconnectSelectedSession(): Promise<void> {
    if (!selectedSession.value) {
      return
    }
    await closeSession(selectedSession.value.sessionId)
    selectedSessionId.value = ''
  }

  async function reconnectSelectedDevice(): Promise<void> {
    if (!selectedDevice.value || typeof selectedDevice.value.ipAddress !== 'string') {
      return
    }
    await reconnectDevice({
      deviceId: selectedDevice.value.deviceId,
      host: selectedDevice.value.ipAddress,
      port: DEFAULT_SOCKET_PORT
    })
    await syncSessionState()
  }

  async function refreshDeviceDiscovery(): Promise<void> {
    await refreshDevices()
  }

  return {
    connectInFlight,
    connectSelectedDevice,
    disconnectSelectedSession,
    reconnectSelectedDevice,
    refreshDeviceDiscovery
  }
}
