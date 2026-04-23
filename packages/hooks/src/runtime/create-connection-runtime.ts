import type { DiscoveryState, DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import { type Ref, ref } from 'vue'
import type {
  AppLinkState,
  RuntimeConnectedSession,
  RuntimeOpenSessionInput,
  RuntimeSessionState,
  SynraConnectionFilter,
  SynraConnectionMessage,
  SynraConnectionSendInput,
  SynraDiscoveryStartOptions,
  SynraLanWireEvent,
  SynraLanWireFilter,
  SynraLanWireSendInput
} from '../types'
import type { ConnectionRuntimeAdapter } from './adapter'
import { registerAdapterListeners } from './adapter-listeners'
import { ConnectedSessionsBook } from './connected-sessions-book'
import { createDiscoveryModule } from './discovery-module'
import { registerLanTransportAppLifecycle } from './lan-app-lifecycle'
import { createLanWireListenersRegistry } from './lan-wire-listeners'
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
  sendMessage(input: SynraConnectionSendInput): Promise<void>
  sendLanEvent(input: SynraLanWireSendInput): Promise<void>
  setSessionAppLink(sessionId: string, app: AppLinkState, lastAppError?: string): void
  setAppLinkForDevice(deviceId: string, app: AppLinkState, lastAppError?: string): void
  onMessage(
    handler: (message: SynraConnectionMessage) => void | Promise<void>,
    filter?: SynraConnectionFilter
  ): () => void
  onLanWireEvent(
    handler: (event: SynraLanWireEvent) => void | Promise<void>,
    filter?: SynraLanWireFilter
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
  let lanAppLifecycle: { remove: () => Promise<void> } | undefined

  const sessionsBook = new ConnectedSessionsBook(connectedSessions)
  const messageRegistry = createMessageListenersRegistry()
  const lanWireRegistry = createLanWireListenersRegistry()

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

  async function startDiscovery(discoveryOptions?: SynraDiscoveryStartOptions): Promise<void> {
    await discoveryModule.startDiscovery(discoveryOptions)
  }

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
      connectedSessions,
      messageRegistry,
      lanWireRegistry
    })

    if (isMobileRuntime && lanAppLifecycle === undefined) {
      lanAppLifecycle = await registerLanTransportAppLifecycle({
        adapter,
        scanState,
        devices,
        connectedSessions
      })
    }

    listenersRegistered = true
  }

  function setSessionAppLink(sessionId: string, app: AppLinkState, lastAppError?: string): void {
    sessionsBook.setSessionAppLink(sessionId, app, { lastAppError, immediate: true })
  }

  function setAppLinkForDevice(deviceId: string, app: AppLinkState, lastAppError?: string): void {
    sessionsBook.setAppLinkForDevice(deviceId, app, { lastAppError })
  }

  return {
    scanState,
    devices,
    loading,
    error,
    sessionState,
    connectedSessions,
    ensureListeners,
    startDiscovery,
    openSession: sessionModule.openSession.bind(sessionModule),
    closeSession: sessionModule.closeSession.bind(sessionModule),
    sendMessage: sessionModule.sendMessage.bind(sessionModule),
    sendLanEvent: sessionModule.sendLanEvent.bind(sessionModule),
    setSessionAppLink,
    setAppLinkForDevice,
    onMessage: messageRegistry.onMessage.bind(messageRegistry),
    onLanWireEvent: lanWireRegistry.onLanWireEvent.bind(lanWireRegistry)
  }
}
