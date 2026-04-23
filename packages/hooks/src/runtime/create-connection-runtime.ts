import type { DiscoveryState, DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import { type Ref, ref } from 'vue'
import type {
  RuntimeConnectedSession,
  RuntimeOpenSessionInput,
  RuntimeSessionState,
  SynraConnectionFilter,
  SynraConnectionMessage,
  SynraConnectionSendInput,
  SynraDiscoveryStartOptions
} from '../types'
import type { ConnectionRuntimeAdapter } from './adapter'
import { registerAdapterListeners } from './adapter-listeners'
import { ConnectedSessionsBook } from './connected-sessions-book'
import { createDiscoveryModule } from './discovery-module'
import { createMessageListenersRegistry } from './message-listeners'
import { createSessionOperationsModule } from './session-operations-module'

export type ConnectionRuntime = {
  scanState: Ref<DiscoveryState>
  devices: Ref<DiscoveredDevice[]>
  loading: Ref<boolean>
  error: Ref<string | null>
  sessionState: Ref<RuntimeSessionState>
  connectedSessions: Ref<RuntimeConnectedSession[]>
  ensureListeners(): Promise<void>
  startDiscovery(options?: SynraDiscoveryStartOptions): Promise<void>
  openSession(options: RuntimeOpenSessionInput): Promise<void>
  closeSession(sessionId?: string): Promise<void>
  invalidateHandoffForHostKeys(keys: readonly string[]): void
  sendMessage(input: SynraConnectionSendInput): Promise<void>
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
  const scanState = ref<DiscoveryState>('idle')
  const devices = ref<DiscoveredDevice[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const sessionState = ref<RuntimeSessionState>({
    state: 'idle'
  })
  const connectedSessions = ref<RuntimeConnectedSession[]>([])
  let listenersRegistered = false

  const sessionsBook = new ConnectedSessionsBook(connectedSessions)
  const messageRegistry = createMessageListenersRegistry()

  const discoveryModule = createDiscoveryModule({
    adapter,
    scanState,
    devices,
    loading,
    error,
    connectedSessions
  })

  const sessionModule = createSessionOperationsModule({
    adapter,
    error,
    sessionState,
    sessionsBook
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
      sessionsBook,
      messageRegistry
    })

    listenersRegistered = true
  }

  function invalidateHandoffForHostKeys(keys: readonly string[]): void {
    adapter.invalidateHandoffForHostKeys?.(keys)
  }

  return {
    scanState,
    devices,
    loading,
    error,
    sessionState,
    connectedSessions,
    ensureListeners,
    startDiscovery: discoveryModule.startDiscovery.bind(discoveryModule),
    openSession: sessionModule.openSession.bind(sessionModule),
    closeSession: sessionModule.closeSession.bind(sessionModule),
    invalidateHandoffForHostKeys,
    sendMessage: sessionModule.sendMessage.bind(sessionModule),
    onMessage: messageRegistry.onMessage.bind(messageRegistry)
  }
}
