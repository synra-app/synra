import { expect, test } from 'vite-plus/test'
import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import type {
  GetTransportStateResult,
  OpenTransportOptions,
  TransportOpenedEvent
} from '@synra/capacitor-device-connection'
import { configureHooksRuntime, resetConnectionRuntime, useTransport } from '../src/index'
import type { ConnectionRuntimeAdapter } from '../src/runtime/adapter'

function createScanOnlyAdapter(
  scanRounds: DiscoveredDevice[][]
): ConnectionRuntimeAdapter & { emitInboundSessionOpened: (event: TransportOpenedEvent) => void } {
  let round = 0
  let sessionOpenedListener: ((event: TransportOpenedEvent) => void) | undefined
  let lastListedDevices: DiscoveredDevice[] = []

  return {
    async startDiscovery() {
      const devices = scanRounds[Math.min(round, scanRounds.length - 1)] ?? []
      round += 1
      lastListedDevices = devices
      return { state: 'scanning' as const, devices, requestId: 'r1' }
    },
    async listDiscoveredDevices() {
      return { state: 'scanning' as const, devices: [...lastListedDevices] }
    },
    async openTransport(_options: OpenTransportOptions) {
      return { deviceId: _options.deviceId, state: 'open' as const, transport: 'tcp' as const }
    },
    async closeTransport() {},
    async sendMessage() {},
    async sendLanEvent() {},
    async getTransportState(): Promise<GetTransportStateResult> {
      return { state: 'idle', transport: 'tcp' }
    },
    async addDeviceConnectableUpdatedListener() {
      return { remove: async () => {} }
    },
    async addDeviceLostListener() {
      return { remove: async () => {} }
    },
    async addTransportOpenedListener(listener: (event: TransportOpenedEvent) => void) {
      sessionOpenedListener = listener
      return { remove: async () => {} }
    },
    async addTransportClosedListener() {
      return { remove: async () => {} }
    },
    async addMessageReceivedListener() {
      return { remove: async () => {} }
    },
    async addMessageAckListener() {
      return { remove: async () => {} }
    },
    async addTransportErrorListener() {
      return { remove: async () => {} }
    },
    async addLanWireEventReceivedListener() {
      return { remove: async () => {} }
    },
    emitInboundSessionOpened(event: TransportOpenedEvent) {
      sessionOpenedListener?.(event)
    }
  }
}

test('startDiscovery drops session-sourced peers when scan does not include them', async () => {
  const sessionPeer: DiscoveredDevice = {
    deviceId: 'device-ios',
    name: 'iOS',
    ipAddress: '192.168.1.77',
    port: 32100,
    source: 'session',
    connectable: true,
    discoveredAt: Date.now(),
    lastSeenAt: Date.now()
  }
  const adapter = createScanOnlyAdapter([
    [],
    [
      {
        deviceId: 'device-other',
        name: 'Other',
        ipAddress: '192.168.1.20',
        source: 'probe',
        connectable: true,
        connectCheckAt: 1,
        discoveredAt: 1,
        lastSeenAt: 1
      }
    ]
  ])

  configureHooksRuntime({ adapterFactory: () => adapter })
  resetConnectionRuntime()
  const transport = useTransport()
  await transport.ensureReady()
  await transport.startScan()
  expect(transport.peers.value.map((p) => p.deviceId)).toEqual([])

  adapter.emitInboundSessionOpened({
    deviceId: sessionPeer.deviceId,
    host: sessionPeer.ipAddress,
    port: 32100,
    direction: 'inbound',
    displayName: sessionPeer.name,
    transport: 'tcp'
  })
  expect(transport.peers.value.map((p) => p.deviceId)).toContain('device-ios')

  await transport.startScan()
  const ids = transport.peers.value.map((p) => p.deviceId).sort()
  expect(ids).toEqual(['device-other'])
})

test('session open can promote source, but rescan still uses fresh discovery snapshot', async () => {
  const adapter = createScanOnlyAdapter([
    [
      {
        deviceId: 'device-android',
        name: 'Android',
        ipAddress: '192.168.1.30',
        source: 'probe',
        connectable: true,
        connectCheckAt: 1,
        discoveredAt: 1,
        lastSeenAt: 1
      }
    ],
    []
  ])

  configureHooksRuntime({ adapterFactory: () => adapter })
  resetConnectionRuntime()
  const transport = useTransport()
  await transport.ensureReady()
  await transport.startScan()
  expect(transport.peers.value.map((p) => p.deviceId)).toEqual(['device-android'])
  expect(transport.peers.value[0]?.source).toBe('probe')

  adapter.emitInboundSessionOpened({
    deviceId: 'device-android',
    host: '192.168.1.30',
    port: 32100,
    direction: 'inbound',
    displayName: 'Android',
    transport: 'tcp'
  })
  expect(transport.peers.value[0]?.source).toBe('session')

  await transport.startScan()
  expect(transport.peers.value.map((p) => p.deviceId)).toEqual([])
})
