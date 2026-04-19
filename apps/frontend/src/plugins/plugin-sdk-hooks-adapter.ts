import {
  configureSynraHooks,
  type SynraHookSendMessageInput,
  type SynraHooksAdapter
} from '@synra/plugin-sdk/hooks'
import { storeToRefs } from 'pinia'
import { useLanDiscoveryStore } from '../stores/lan-discovery'

function createFrontendHooksAdapter(): SynraHooksAdapter {
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
    eventLogs
  } = storeToRefs(store)

  return {
    scanState,
    startedAt,
    scanWindowMs,
    devices,
    loading,
    error,
    sessionState,
    connectedSessions,
    eventLogs,
    ensureListeners: () => store.ensureListeners(),
    startDiscovery: (manualTargets?: string[]) => store.startDiscovery(manualTargets),
    stopDiscovery: () => store.stopDiscovery(),
    refreshDevices: () => store.refreshDevices(),
    pairDevice: (deviceId: string) => store.pairDevice(deviceId),
    probeConnectable: (port?: number, timeoutMs?: number) =>
      store.probeConnectable(port, timeoutMs),
    openSession: (options: { deviceId: string; host: string; port: number }) =>
      store.openSession(options),
    closeSession: (sessionId?: string) => store.closeSession(sessionId),
    syncSessionState: (sessionId?: string) => store.syncSessionState(sessionId),
    sendMessage: (input: SynraHookSendMessageInput) => store.sendMessage(input)
  }
}

export function installPluginSdkHooksAdapter(): void {
  configureSynraHooks(createFrontendHooksAdapter)
}
