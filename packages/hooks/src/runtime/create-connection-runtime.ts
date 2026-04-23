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
  SynraDiscoveryStartOptions
} from '../types'
import type { ConnectionRuntimeAdapter } from './adapter'
import { registerAdapterListeners } from './adapter-listeners'
import { ConnectedSessionsBook } from './connected-sessions-book'
import { getHooksRuntimeOptions, isLocalDiscoveryDeviceId } from './config'
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
  sendMessage(input: SynraConnectionSendInput): Promise<void>
  setSessionAppLink(sessionId: string, app: AppLinkState, lastAppError?: string): void
  setAppLinkForDevice(deviceId: string, app: AppLinkState, lastAppError?: string): void
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

  async function startDiscovery(discoveryOptions?: SynraDiscoveryStartOptions): Promise<void> {
    await discoveryModule.startDiscovery(discoveryOptions)
    const exclude = getHooksRuntimeOptions().shouldExcludeDiscoveredDevice
    const shouldDrop = (deviceId: string) =>
      isLocalDiscoveryDeviceId(deviceId) || (typeof exclude === 'function' && exclude(deviceId))
    for (const d of devices.value) {
      if (!d.connectable) {
        continue
      }
      const host = typeof d.ipAddress === 'string' ? d.ipAddress.trim() : ''
      if (host.length === 0) {
        continue
      }
      if (shouldDrop(d.deviceId)) {
        continue
      }
      void sessionModule
        .openSession({
          deviceId: d.deviceId,
          host,
          port: typeof d.port === 'number' && d.port > 0 ? d.port : 32100,
          suppressGlobalError: true
        })
        .catch(() => undefined)
    }
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
      messageRegistry
    })

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
    setSessionAppLink,
    setAppLinkForDevice,
    onMessage: messageRegistry.onMessage.bind(messageRegistry)
  }
}
