import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import { ref, type Ref } from 'vue'
import type {
  SynraConnectionFilter,
  SynraConnectionMessage,
  SynraConnectionRuntimeState,
  SynraConnectionSendInput,
  SynraDiscoveryStartOptions,
  SynraHookConnectedSession,
  SynraHookEventLog,
  SynraHookSessionState
} from '../types'
import type { ConnectionRuntimeAdapter } from './adapter'
import { registerAdapterListeners } from './adapter-listeners'
import { ConnectedSessionsBook } from './connected-sessions-book'
import { DesktopHandoffState } from './desktop-handoff'
import { createDiscoveryModule } from './discovery-module'
import { createEventLogAppender } from './event-log'
import { createMessageListenersRegistry } from './message-listeners'
import { createSessionOperationsModule, type ReconnectTask } from './session-operations-module'

export type { ReconnectTask } from './session-operations-module'

export type ConnectionRuntime = SynraConnectionRuntimeState & {
  reconnectTasks: Readonly<Ref<ReconnectTask[]>>
  ensureListeners(): Promise<void>
  startDiscovery(options?: string[] | SynraDiscoveryStartOptions): Promise<void>
  stopDiscovery(): Promise<void>
  refreshDevices(): Promise<void>
  probeConnectable(port?: number, timeoutMs?: number): Promise<void>
  openSession(options: {
    deviceId: string
    host: string
    port: number
    transport?: 'tcp'
  }): Promise<void>
  closeSession(sessionId?: string): Promise<void>
  syncSessionState(sessionId?: string): Promise<void>
  sendMessage(input: SynraConnectionSendInput): Promise<void>
  reconnectDevice(options: { deviceId: string; host: string; port: number }): Promise<void>
  onMessage(
    handler: (message: SynraConnectionMessage) => void | Promise<void>,
    filter?: SynraConnectionFilter
  ): () => void
}

export function createConnectionRuntime(adapter: ConnectionRuntimeAdapter): ConnectionRuntime {
  const runtimePlatform = (
    globalThis as {
      Capacitor?: {
        getPlatform?: () => string
      }
    }
  ).Capacitor?.getPlatform?.()
  const isMobileRuntime = runtimePlatform === 'android' || runtimePlatform === 'ios'
  const scanState = ref('idle')
  const startedAt = ref<number | undefined>(undefined)
  const scanWindowMs = ref(15_000)
  const devices = ref<DiscoveredDevice[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const sessionState = ref<SynraHookSessionState>({
    state: 'idle',
    transport: 'tcp'
  })
  const connectedSessions = ref<SynraHookConnectedSession[]>([])
  const eventLogs = ref<SynraHookEventLog[]>([])
  const reconnectTasks = ref<ReconnectTask[]>([])
  const reconnectLocks = new Set<string>()
  let listenersRegistered = false

  const { appendEventLog } = createEventLogAppender(eventLogs)
  const sessionsBook = new ConnectedSessionsBook(connectedSessions)
  const handoff = new DesktopHandoffState()
  const messageRegistry = createMessageListenersRegistry()

  const discoveryModule = createDiscoveryModule({
    adapter,
    scanState,
    startedAt,
    scanWindowMs,
    devices,
    loading,
    error
  })

  const sessionModule = createSessionOperationsModule({
    adapter,
    isMobileRuntime,
    loading,
    error,
    sessionState,
    reconnectTasks,
    reconnectLocks,
    handoff,
    sessionsBook,
    appendEventLog
  })

  async function ensureListeners(): Promise<void> {
    if (listenersRegistered) {
      return
    }

    await registerAdapterListeners({
      adapter,
      isMobileRuntime,
      devices,
      sessionState,
      error,
      appendEventLog,
      sessionsBook,
      handoff,
      messageRegistry
    })

    listenersRegistered = true
  }

  return {
    scanState,
    startedAt,
    scanWindowMs,
    devices,
    reconnectTasks,
    loading,
    error,
    sessionState,
    connectedSessions,
    eventLogs,
    ensureListeners,
    startDiscovery: discoveryModule.startDiscovery.bind(discoveryModule),
    stopDiscovery: discoveryModule.stopDiscovery.bind(discoveryModule),
    refreshDevices: discoveryModule.refreshDevices.bind(discoveryModule),
    probeConnectable: discoveryModule.probeConnectable.bind(discoveryModule),
    openSession: sessionModule.openSession.bind(sessionModule),
    closeSession: sessionModule.closeSession.bind(sessionModule),
    syncSessionState: sessionModule.syncSessionState.bind(sessionModule),
    sendMessage: sessionModule.sendMessage.bind(sessionModule),
    reconnectDevice: sessionModule.reconnectDevice.bind(sessionModule),
    onMessage: messageRegistry.onMessage.bind(messageRegistry)
  }
}
