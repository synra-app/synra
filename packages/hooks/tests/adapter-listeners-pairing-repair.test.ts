import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { ref } from 'vue'
import type {
  LanWireEventReceivedEvent,
  MessageAckEvent,
  MessageReceivedEvent,
  TransportClosedEvent,
  TransportErrorEvent,
  TransportOpenedEvent
} from '@synra/capacitor-device-connection'
import type { DeviceConnectableUpdatedEvent } from '@synra/capacitor-lan-discovery'
import { registerAdapterListeners } from '../src/runtime/adapter-listeners'
import type { ConnectionRuntimeAdapter, ListenerHandle } from '../src/runtime/adapter'
import { configureHooksRuntime, resetHooksRuntimeOptions } from '../src/runtime/config'
import { createLanWireListenersRegistry } from '../src/runtime/lan-wire-listeners'
import { createMessageListenersRegistry } from '../src/runtime/message-listeners'
import { OpenTransportLinksBook } from '../src/runtime/open-transport-links-book'

type ListenerBag = {
  onDeviceUpdated?: (event: DeviceConnectableUpdatedEvent) => void
  onDeviceLost?: (event: { deviceId: string; ipAddress?: string }) => void
  onTransportOpened?: (event: TransportOpenedEvent) => void
  onTransportClosed?: (event: TransportClosedEvent) => void
  onMessageReceived?: (event: MessageReceivedEvent) => void
  onMessageAck?: (event: MessageAckEvent) => void
  onLanWireEvent?: (event: LanWireEventReceivedEvent) => void
  onTransportError?: (event: TransportErrorEvent) => void
}

function createAdapterHarness(): { adapter: ConnectionRuntimeAdapter; listeners: ListenerBag } {
  const listeners: ListenerBag = {}
  const noopHandle: ListenerHandle = {
    remove: async () => undefined
  }
  const adapter: ConnectionRuntimeAdapter = {
    startDiscovery: async () => ({ state: 'idle', devices: [] }),
    listDiscoveredDevices: async () => ({ state: 'idle', devices: [] }),
    openTransport: async () => ({ deviceId: 'device-a', state: 'open', transport: 'tcp' }),
    closeTransport: async () => undefined,
    sendMessage: async () => undefined,
    sendLanEvent: async () => undefined,
    getTransportState: async () => ({ state: 'idle', transport: 'tcp' }),
    addDeviceConnectableUpdatedListener: async (listener) => {
      listeners.onDeviceUpdated = listener
      return noopHandle
    },
    addDeviceLostListener: async (listener) => {
      listeners.onDeviceLost = listener
      return noopHandle
    },
    addTransportOpenedListener: async (listener) => {
      listeners.onTransportOpened = listener
      return noopHandle
    },
    addTransportClosedListener: async (listener) => {
      listeners.onTransportClosed = listener
      return noopHandle
    },
    addMessageReceivedListener: async (listener) => {
      listeners.onMessageReceived = listener
      return noopHandle
    },
    addMessageAckListener: async (listener) => {
      listeners.onMessageAck = listener
      return noopHandle
    },
    addTransportErrorListener: async (listener) => {
      listeners.onTransportError = listener
      return noopHandle
    },
    addLanWireEventReceivedListener: async (listener) => {
      listeners.onLanWireEvent = listener
      return noopHandle
    }
  }
  return { adapter, listeners }
}

async function setupHarness(options: {
  onInboundFreshRepair?: (event: TransportOpenedEvent) => void | Promise<void>
  onOutboundAckRepair?: (event: TransportOpenedEvent) => void | Promise<void>
}): Promise<ListenerBag> {
  const { adapter, listeners } = createAdapterHarness()
  configureHooksRuntime({
    repairStalePairingAfterInboundFreshConnect: options.onInboundFreshRepair,
    repairStalePairingAfterOutboundUnpairedAck: options.onOutboundAckRepair
  })
  const devices = ref([])
  const primaryTransportState = ref({ state: 'idle' as const })
  const error = ref<string | null>(null)
  const openTransportLinks = ref([])
  await registerAdapterListeners({
    adapter,
    isMobileRuntime: false,
    devices,
    primaryTransportState,
    error,
    openLinksBook: new OpenTransportLinksBook(openTransportLinks),
    openTransportLinks,
    messageRegistry: createMessageListenersRegistry(),
    lanWireRegistry: createLanWireListenersRegistry()
  })
  return listeners
}

describe('adapter-listeners pairing repair gates', () => {
  afterEach(() => {
    resetHooksRuntimeOptions()
  })

  test('fires inbound fresh repair only with valid Synra identity payload', async () => {
    const inboundRepair = vi.fn()
    const listeners = await setupHarness({
      onInboundFreshRepair: inboundRepair
    })

    listeners.onTransportOpened?.({
      deviceId: 'device-a',
      direction: 'inbound',
      transport: 'tcp',
      incomingSynraConnectPayload: {
        appId: 'synra',
        from: 'peer-uuid',
        connectType: 'fresh'
      }
    })
    expect(inboundRepair).toHaveBeenCalledTimes(1)

    listeners.onTransportOpened?.({
      deviceId: 'device-a',
      direction: 'inbound',
      transport: 'tcp',
      incomingSynraConnectPayload: {
        appId: 'synra',
        connectType: 'fresh'
      }
    })
    expect(inboundRepair).toHaveBeenCalledTimes(1)
  })

  test('fires outbound repair on fresh/unpaired connectAck payload', async () => {
    const outboundRepair = vi.fn()
    const listeners = await setupHarness({
      onOutboundAckRepair: outboundRepair
    })

    listeners.onTransportOpened?.({
      deviceId: 'device-a',
      direction: 'outbound',
      transport: 'tcp',
      connectAckPayload: {
        appId: 'synra',
        hostListsPeerAsPaired: false
      }
    })
    listeners.onTransportOpened?.({
      deviceId: 'device-b',
      direction: 'outbound',
      transport: 'tcp',
      connectAckPayload: {
        appId: 'synra',
        connectType: 'fresh'
      }
    })
    listeners.onTransportOpened?.({
      deviceId: 'device-c',
      direction: 'outbound',
      transport: 'tcp',
      connectAckPayload: {
        appId: 'synra',
        connectType: 'paired',
        hostListsPeerAsPaired: true
      }
    })
    expect(outboundRepair).toHaveBeenCalledTimes(2)
  })
})
