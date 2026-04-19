import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import {
  useConnection,
  useConnectionState,
  useDevices,
  useDiscovery,
  useSessionMessages,
  type SynraHookConnectedSession,
  type SynraHookSendMessageInput
} from '@synra/hooks'
import type { SynraMessageType } from '@synra/protocol'
import { defineStore } from 'pinia'
import { computed } from 'vue'

export type ConnectedSession = SynraHookConnectedSession

export const useLanDiscoveryStore = defineStore('lan-discovery', () => {
  const discovery = useDiscovery()
  const devicesApi = useDevices()
  const connectionState = useConnectionState()
  const connection = useConnection()
  const { sessionLogs } = useSessionMessages()

  const pairedDevices = computed(() => devicesApi.pairedDevices.value as DiscoveredDevice[])

  async function sendMessage(input: SynraHookSendMessageInput): Promise<void> {
    await connection.sendMessage(input)
  }

  return {
    scanState: discovery.scanState,
    startedAt: discovery.startedAt,
    scanWindowMs: discovery.scanWindowMs,
    devices: devicesApi.devices,
    pairedDevices,
    loading: discovery.loading,
    error: discovery.error,
    sessionState: connectionState.sessionState,
    connectedSessions: connectionState.connectedSessions,
    eventLogs: sessionLogs,
    ensureListeners: connection.ensureListeners,
    startDiscovery: discovery.startDiscovery,
    stopDiscovery: discovery.stopDiscovery,
    refreshDevices: devicesApi.refreshDevices,
    pairDevice: devicesApi.pairDevice,
    probeConnectable: discovery.probeConnectable,
    openSession: connectionState.openSession,
    closeSession: connectionState.closeSession,
    sendMessage,
    syncSessionState: connectionState.syncSessionState
  }
})

export type LanStoreSendMessageInput<TType extends SynraMessageType = SynraMessageType> = {
  sessionId: string
  messageType: TType
  payload: unknown
  messageId?: string
}
