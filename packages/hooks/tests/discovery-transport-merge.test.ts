import { expect, test } from 'vite-plus/test'
import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import type {
  GetTransportStateResult,
  OpenTransportOptions,
  TransportOpenedEvent
} from '@synra/capacitor-device-connection'
import { configureHooksRuntime, resetConnectionRuntime, useTransport } from '../src/index'
import type { ConnectionRuntimeAdapter } from '../src/runtime/adapter'

function createScanOnlyAdapter(scanRounds: DiscoveredDevice[][]): ConnectionRuntimeAdapter & {
  emitInboundTransportOpened: (event: TransportOpenedEvent) => void
} {
  let round = 0
  let transportOpenedListener: ((event: TransportOpenedEvent) => void) | undefined
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
      transportOpenedListener = listener
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
    emitInboundTransportOpened(event: TransportOpenedEvent) {
      transportOpenedListener?.(event)
    }
  }
}

test('startDiscovery keeps transport peers when scan omits them by merging open links', async () => {
  const transportPeer: DiscoveredDevice = {
    deviceId: 'device-ios',
    name: 'iOS',
    ipAddress: '192.168.1.77',
    port: 32100,
    source: 'transport',
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

  adapter.emitInboundTransportOpened({
    deviceId: transportPeer.deviceId,
    host: transportPeer.ipAddress,
    port: 32100,
    direction: 'inbound',
    displayName: transportPeer.name,
    transport: 'tcp'
  })
  expect(transport.peers.value.map((p) => p.deviceId)).toContain('device-ios')

  await transport.startScan()
  const ids = transport.peers.value.map((p) => p.deviceId).sort()
  expect(ids).toEqual(['device-ios', 'device-other'])
})

test('transport open promotes source, rescan keeps long-lived link row when LAN snapshot is empty', async () => {
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

  adapter.emitInboundTransportOpened({
    deviceId: 'device-android',
    host: '192.168.1.30',
    port: 32100,
    direction: 'inbound',
    displayName: 'Android',
    transport: 'tcp'
  })
  expect(transport.peers.value[0]?.source).toBe('transport')

  await transport.startScan()
  expect(transport.peers.value.map((p) => p.deviceId)).toEqual(['device-android'])
  expect(transport.peers.value[0]?.source).toBe('transport')
})
