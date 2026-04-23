import { expect, test } from 'vite-plus/test'
import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import type {
  GetSessionStateResult,
  OpenSessionOptions,
  SessionOpenedEvent
} from '@synra/capacitor-device-connection'
import { configureHooksRuntime, resetConnectionRuntime, useTransport } from '../src/index'
import type { ConnectionRuntimeAdapter } from '../src/runtime/adapter'

function createScanOnlyAdapter(
  scanRounds: DiscoveredDevice[][]
): ConnectionRuntimeAdapter & { emitInboundSessionOpened: (event: SessionOpenedEvent) => void } {
  let round = 0
  let sessionOpenedListener: ((event: SessionOpenedEvent) => void) | undefined
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
    async openSession(_options: OpenSessionOptions) {
      return { sessionId: 's1', state: 'open' as const, transport: 'tcp' as const }
    },
    async closeSession() {},
    async sendMessage() {},
    async sendLanEvent() {},
    async getSessionState(): Promise<GetSessionStateResult> {
      return { state: 'idle', transport: 'tcp' }
    },
    async addDeviceConnectableUpdatedListener() {
      return { remove: async () => {} }
    },
    async addDeviceLostListener() {
      return { remove: async () => {} }
    },
    async addSessionOpenedListener(listener: (event: SessionOpenedEvent) => void) {
      sessionOpenedListener = listener
      return { remove: async () => {} }
    },
    async addSessionClosedListener() {
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
    emitInboundSessionOpened(event: SessionOpenedEvent) {
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
        source: 'mdns',
        connectable: true,
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
    sessionId: 'in-1',
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
        source: 'mdns',
        connectable: true,
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
  expect(transport.peers.value[0]?.source).toBe('mdns')

  adapter.emitInboundSessionOpened({
    sessionId: 'in-android-1',
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
