import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { ref, type Ref } from 'vue'
import type {
  LanWireEventReceivedEvent,
  MessageAckEvent,
  MessageReceivedEvent,
  TransportClosedEvent,
  TransportErrorEvent,
  TransportOpenedEvent
} from '@synra/capacitor-device-connection'
import type {
  DeviceConnectableUpdatedEvent,
  DiscoveredDevice
} from '@synra/capacitor-lan-discovery'
import {
  DEVICE_PAIRING_PEER_RESET_EVENT,
  DEVICE_PAIRING_UNPAIR_REQUIRED_EVENT
} from '@synra/protocol'
import { DEFAULT_SYNRA_TCP_PORT } from '../src/runtime/constants'
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
  shouldExcludeDiscoveredDevice?: (deviceId: string) => boolean
}): Promise<{ listeners: ListenerBag; devices: Ref<DiscoveredDevice[]> }> {
  const { adapter, listeners } = createAdapterHarness()
  configureHooksRuntime({
    repairStalePairingAfterInboundFreshConnect: options.onInboundFreshRepair,
    repairStalePairingAfterOutboundUnpairedAck: options.onOutboundAckRepair,
    ...(typeof options.shouldExcludeDiscoveredDevice === 'function'
      ? { shouldExcludeDiscoveredDevice: options.shouldExcludeDiscoveredDevice }
      : {})
  })
  const devices = ref<DiscoveredDevice[]>([])
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
  return { listeners, devices }
}

/** Flush microtasks so `dispatchSynraWireEvent(...).finally` runs before assertions. */
async function settleWireDispatchFinally(): Promise<void> {
  await new Promise<void>((resolve) => {
    queueMicrotask(() => {
      queueMicrotask(resolve)
    })
  })
}

describe('adapter-listeners pairing repair gates', () => {
  afterEach(() => {
    resetHooksRuntimeOptions()
  })

  test('fires inbound fresh repair only with valid Synra identity payload', async () => {
    const inboundRepair = vi.fn()
    const { listeners } = await setupHarness({
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
    const { listeners } = await setupHarness({
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

  test('after unpair-required, re-upserts peer into discovery when paired had hidden them', async () => {
    const peerId = '22222222-2222-4222-8222-222222222222'
    const { listeners, devices } = await setupHarness({
      shouldExcludeDiscoveredDevice: (id) => id === peerId
    })

    listeners.onTransportOpened?.({
      deviceId: peerId,
      direction: 'inbound',
      host: '10.0.0.55',
      port: DEFAULT_SYNRA_TCP_PORT,
      transport: 'tcp',
      incomingSynraConnectPayload: {
        appId: 'synra',
        from: peerId,
        connectType: 'paired'
      }
    })
    expect(devices.value.some((d) => d.deviceId === peerId)).toBe(false)

    listeners.onLanWireEvent?.({
      event: DEVICE_PAIRING_UNPAIR_REQUIRED_EVENT,
      requestId: '00000000-0000-4000-8000-000000000001',
      from: peerId,
      target: '11111111-1111-4111-8111-111111111111',
      payload: { reason: 'Peer manually removed this pairing.', mode: 'stale' },
      timestamp: Date.now(),
      transport: 'tcp'
    })
    await settleWireDispatchFinally()

    const row = devices.value.find((d) => d.deviceId === peerId)
    expect(row).toBeDefined()
    expect(row?.ipAddress).toBe('10.0.0.55')
    expect(row?.connectable).toBe(true)
  })

  test('after peer-reset, re-upserts peer into discovery when paired had hidden them', async () => {
    const peerId = '33333333-3333-4333-8333-333333333333'
    const { listeners, devices } = await setupHarness({
      shouldExcludeDiscoveredDevice: (id) => id === peerId
    })

    listeners.onTransportOpened?.({
      deviceId: peerId,
      direction: 'inbound',
      host: '10.0.0.66',
      port: DEFAULT_SYNRA_TCP_PORT,
      transport: 'tcp',
      incomingSynraConnectPayload: {
        appId: 'synra',
        from: peerId,
        connectType: 'paired'
      }
    })
    expect(devices.value.some((d) => d.deviceId === peerId)).toBe(false)

    listeners.onLanWireEvent?.({
      event: DEVICE_PAIRING_PEER_RESET_EVENT,
      requestId: '00000000-0000-4000-8000-000000000002',
      from: peerId,
      target: '11111111-1111-4111-8111-111111111111',
      payload: { from: peerId, reason: 'Peer cleared this pairing.' },
      timestamp: Date.now(),
      transport: 'tcp'
    })
    await settleWireDispatchFinally()

    const row = devices.value.find((d) => d.deviceId === peerId)
    expect(row).toBeDefined()
    expect(row?.ipAddress).toBe('10.0.0.66')
    expect(row?.connectable).toBe(true)
  })
})
