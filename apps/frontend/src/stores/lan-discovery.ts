import {
  useConnection,
  useConnectionState,
  useDevices,
  useDiscovery,
  useSessionMessages,
  type SynraHookConnectedSession
} from '@synra/hooks'
import { defineStore } from 'pinia'

export type ConnectedSession = SynraHookConnectedSession

export const useLanDiscoveryStore = defineStore('lan-discovery', () => {
  const discovery = useDiscovery()
  const devicesApi = useDevices()
  const connectionState = useConnectionState()
  const connection = useConnection()
  const { sessionLogs } = useSessionMessages()

  return {
    scanState: discovery.scanState,
    startedAt: discovery.startedAt,
    scanWindowMs: discovery.scanWindowMs,
    devices: devicesApi.devices,
    loading: discovery.loading,
    error: discovery.error,
    sessionState: connectionState.sessionState,
    connectedSessions: connectionState.connectedSessions,
    reconnectTasks: connectionState.reconnectTasks,
    eventLogs: sessionLogs,
    ensureListeners: connection.ensureListeners,
    startDiscovery: discovery.startDiscovery,
    stopDiscovery: discovery.stopDiscovery,
    refreshDevices: devicesApi.refreshDevices,
    probeConnectable: discovery.probeConnectable,
    openSession: connectionState.openSession,
    closeSession: connectionState.closeSession,
    sendMessage: connection.sendMessage,
    reconnectDevice: connectionState.reconnectDevice,
    syncSessionState: connectionState.syncSessionState
  }
})
