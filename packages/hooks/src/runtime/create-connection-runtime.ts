import type { DiscoveryState, DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import { type Ref, ref } from 'vue'
import type {
  RuntimeOpenTransportInput,
  RuntimeOpenTransportLink,
  RuntimePrimaryTransportState,
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
import { createDiscoveryModule } from './discovery-module'
import { registerLanTransportAppLifecycle, type LanAppLifecycleHandle } from './lan-app-lifecycle'
import { createLanWireListenersRegistry } from './lan-wire-listeners'
import { createMessageListenersRegistry } from './message-listeners'
import { OpenTransportLinksBook } from './open-transport-links-book'
import { createTransportOperationsModule } from './transport-operations-module'

export type ConnectionRuntime = {
  scanState: Ref<DiscoveryState>
  devices: Ref<DiscoveredDevice[]>
  loading: Ref<boolean>
  error: Ref<string | null>
  primaryTransportState: Ref<RuntimePrimaryTransportState>
  openTransportLinks: Ref<RuntimeOpenTransportLink[]>
  ensureListeners(): Promise<void>
  startDiscovery(options?: SynraDiscoveryStartOptions): Promise<void>
  openTransport(options: RuntimeOpenTransportInput): Promise<void>
  closeTransport(deviceId?: string): Promise<void>
  sendMessage(input: SynraConnectionSendInput): Promise<void>
  sendLanEvent(input: SynraLanWireSendInput): Promise<void>
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
  const primaryTransportState = ref<RuntimePrimaryTransportState>({
    state: 'idle'
  })
  const openTransportLinks = ref<RuntimeOpenTransportLink[]>([])
  let listenersRegistered = false
  let lanAppLifecycle: LanAppLifecycleHandle | undefined

  const openLinksBook = new OpenTransportLinksBook(openTransportLinks)
  const messageRegistry = createMessageListenersRegistry()
  const lanWireRegistry = createLanWireListenersRegistry()

  const discoveryModule = createDiscoveryModule({
    adapter,
    scanState,
    devices,
    loading,
    error,
    openTransportLinks
  })

  const transportModule = createTransportOperationsModule({
    adapter,
    error,
    primaryTransportState,
    openLinksBook
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
      primaryTransportState,
      error,
      openLinksBook,
      openTransportLinks,
      messageRegistry,
      lanWireRegistry
    })

    if (isMobileRuntime && lanAppLifecycle === undefined) {
      lanAppLifecycle = await registerLanTransportAppLifecycle({
        adapter,
        scanState,
        devices,
        openTransportLinks
      })
    }

    listenersRegistered = true
  }

  return {
    scanState,
    devices,
    loading,
    error,
    primaryTransportState,
    openTransportLinks,
    ensureListeners,
    startDiscovery,
    openTransport: transportModule.openTransport.bind(transportModule),
    closeTransport: transportModule.closeTransport.bind(transportModule),
    sendMessage: transportModule.sendMessage.bind(transportModule),
    sendLanEvent: transportModule.sendLanEvent.bind(transportModule),
    onMessage: messageRegistry.onMessage.bind(messageRegistry),
    onLanWireEvent: lanWireRegistry.onLanWireEvent.bind(lanWireRegistry)
  }
}
