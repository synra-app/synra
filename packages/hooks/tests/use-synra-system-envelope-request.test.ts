import { expect, test, vi } from 'vite-plus/test'
import type { LanWireEventReceivedEvent } from '@synra/capacitor-device-connection'
import type {
  GetTransportStateResult,
  MessageAckEvent,
  MessageReceivedEvent,
  OpenTransportOptions,
  SendLanEventOptions,
  TransportClosedEvent,
  TransportErrorEvent,
  TransportOpenedEvent
} from '@synra/capacitor-device-connection'
import type {
  DeviceConnectableUpdatedEvent,
  DiscoveredDevice
} from '@synra/capacitor-lan-discovery'
import { DEVICE_PAIRING_REQUEST_EVENT } from '@synra/protocol'
import {
  configureHooksRuntime,
  resetConnectionRuntime,
  resetHooksRuntimeOptions,
  useSynraSystemEnvelope
} from '../src/index'
import type { ConnectionRuntimeAdapter, DeviceLostEvent } from '../src/runtime/adapter'

const LOCAL_UUID = '11111111-1111-4111-8111-111111111111'
const PEER_UUID = '22222222-2222-4222-8222-222222222222'

function createLanReplyMockAdapter(): ConnectionRuntimeAdapter {
  const devices: DiscoveredDevice[] = [
    {
      deviceId: PEER_UUID,
      name: 'Peer',
      ipAddress: '127.0.0.1',
      source: 'probe',
      connectable: true,
      connectCheckAt: Date.now(),
      discoveredAt: Date.now(),
      lastSeenAt: Date.now()
    }
  ]

  let lanInbound: ((event: LanWireEventReceivedEvent) => void) | undefined

  return {
    async startDiscovery() {
      return { state: 'scanning', devices }
    },
    async listDiscoveredDevices() {
      return { state: 'scanning', devices }
    },
    async openTransport(options: OpenTransportOptions) {
      const event: TransportOpenedEvent = {
        deviceId: options.deviceId,
        host: options.host,
        port: options.port,
        transport: 'tcp',
        direction: 'outbound'
      }
      return { deviceId: event.deviceId, state: 'open', transport: 'tcp' }
    },
    async closeTransport() {},
    async sendMessage() {},
    async sendLanEvent(options: SendLanEventOptions) {
      queueMicrotask(() => {
        const inbound: LanWireEventReceivedEvent = {
          requestId: globalThis.crypto.randomUUID(),
          event: options.event,
          target: options.target,
          from: options.from,
          replyRequestId: options.requestId,
          payload: { ok: true },
          timestamp: Date.now(),
          transport: 'tcp'
        }
        lanInbound?.(inbound)
      })
    },
    async getTransportState(): Promise<GetTransportStateResult> {
      return { state: 'idle', transport: 'tcp' }
    },
    async addDeviceConnectableUpdatedListener(
      _listener: (event: DeviceConnectableUpdatedEvent) => void
    ) {
      return { remove: async () => {} }
    },
    async addDeviceLostListener(_listener: (event: DeviceLostEvent) => void) {
      return { remove: async () => {} }
    },
    async addTransportOpenedListener(_listener: (event: TransportOpenedEvent) => void) {
      return { remove: async () => {} }
    },
    async addTransportClosedListener(_listener: (event: TransportClosedEvent) => void) {
      return { remove: async () => {} }
    },
    async addMessageReceivedListener(_listener: (event: MessageReceivedEvent) => void) {
      return { remove: async () => {} }
    },
    async addMessageAckListener(_listener: (event: MessageAckEvent) => void) {
      return { remove: async () => {} }
    },
    async addTransportErrorListener(_listener: (event: TransportErrorEvent) => void) {
      return { remove: async () => {} }
    },
    async addLanWireEventReceivedListener(listener: (event: LanWireEventReceivedEvent) => void) {
      lanInbound = listener
      return { remove: async () => {} }
    }
  }
}

/** Avoid `isMobileRuntime` + `@capacitor/app` in Node (no `document`). Matches desktop Capacitor-Electron WebView. */
function stubElectronRenderer(): void {
  vi.stubGlobal('process', {
    ...process,
    versions: { ...process.versions, electron: '30.0.0' },
    type: 'renderer'
  })
}

test('useSynraSystemEnvelope request resolves when LAN reply matches replyRequestId', async () => {
  stubElectronRenderer()
  configureHooksRuntime({
    adapterFactory: () => createLanReplyMockAdapter(),
    resolveSynraConnectType: () => 'paired',
    localDiscoveryDeviceId: LOCAL_UUID
  })
  resetConnectionRuntime()

  const synra = useSynraSystemEnvelope()
  const inbound = await synra.request({
    event: DEVICE_PAIRING_REQUEST_EVENT,
    target: PEER_UUID,
    payload: { ping: true }
  })

  expect(inbound.envelope.replyRequestId).toBeDefined()
  expect(inbound.kind).toBe('lan')

  resetHooksRuntimeOptions()
  resetConnectionRuntime()
  vi.unstubAllGlobals()
})

test('useSynraSystemEnvelope request rejects on timeout when no reply', async () => {
  vi.useFakeTimers()
  stubElectronRenderer()

  const adapter = createLanReplyMockAdapter()
  const stubbed: ConnectionRuntimeAdapter = {
    ...adapter,
    async sendLanEvent() {
      /* no synthetic reply */
    }
  }

  configureHooksRuntime({
    adapterFactory: () => stubbed,
    resolveSynraConnectType: () => 'paired',
    localDiscoveryDeviceId: LOCAL_UUID
  })
  resetConnectionRuntime()

  const synra = useSynraSystemEnvelope()
  const outcome = synra
    .request(
      {
        event: DEVICE_PAIRING_REQUEST_EVENT,
        target: PEER_UUID,
        payload: {}
      },
      { timeoutMs: 100 }
    )
    .then(
      () => ({ ok: false as const, error: new Error('expected timeout') }),
      (error: unknown) => ({ ok: true as const, error })
    )

  await vi.advanceTimersByTimeAsync(150)
  const result = await outcome
  expect(result.ok).toBe(true)
  expect(result.error).toBeInstanceOf(Error)
  expect((result.error as Error).message).toBe('useSynraEnvelope request timeout')

  vi.useRealTimers()
  resetHooksRuntimeOptions()
  resetConnectionRuntime()
  vi.unstubAllGlobals()
})
