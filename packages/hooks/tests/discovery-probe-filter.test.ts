import { expect, test } from 'vite-plus/test'
import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import type {
  GetTransportStateResult,
  OpenTransportOptions,
  ProbeSynraPeersOptions,
  ProbeSynraPeersResult
} from '@synra/capacitor-device-connection'
import { SYNRA_PROBE_EMBEDDED_IN_DISCOVERY } from '@synra/capacitor-device-connection'
import {
  configureHooksRuntime,
  resetConnectionRuntime,
  resetHooksRuntimeOptions,
  useTransport
} from '../src/index'
import type { ConnectionRuntimeAdapter } from '../src/runtime/adapter'

const ghostMdns: DiscoveredDevice = {
  deviceId: 'device-candidate-ghost',
  name: '192.168.77.97',
  ipAddress: '192.168.77.97',
  port: 32100,
  source: 'probe',
  connectable: true,
  connectCheckAt: 1,
  discoveredAt: 1,
  lastSeenAt: 1
}

function createProbeFilterAdapter(probe: ProbeSynraPeersResult): ConnectionRuntimeAdapter {
  return {
    async startDiscovery() {
      return { state: 'scanning' as const, devices: [ghostMdns], requestId: 'r1' }
    },
    async listDiscoveredDevices() {
      return { state: 'scanning' as const, devices: [ghostMdns] }
    },
    async probeSynraPeers(_options: ProbeSynraPeersOptions): Promise<ProbeSynraPeersResult> {
      return probe
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
    async addTransportOpenedListener() {
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
    }
  }
}

test('startDiscovery drops mDNS candidates when Synra TCP probe fails', async () => {
  configureHooksRuntime({
    adapterFactory: () =>
      createProbeFilterAdapter({
        results: [
          {
            host: '192.168.77.97',
            port: 32100,
            ok: false,
            error: 'PROBE_TIMEOUT'
          }
        ]
      })
  })
  resetConnectionRuntime()
  const transport = useTransport()
  await transport.ensureReady()
  await transport.startScan()
  expect(transport.peers.value.length).toBe(0)
  resetHooksRuntimeOptions()
  resetConnectionRuntime()
})

test('startDiscovery keeps scan rows when probe is deferred to discovery (Electron)', async () => {
  configureHooksRuntime({
    adapterFactory: () =>
      createProbeFilterAdapter({
        results: [
          {
            host: '192.168.77.97',
            port: 32100,
            ok: false,
            error: SYNRA_PROBE_EMBEDDED_IN_DISCOVERY
          }
        ]
      })
  })
  resetConnectionRuntime()
  const transport = useTransport()
  await transport.ensureReady()
  await transport.startScan()
  expect(transport.peers.value.map((p) => p.deviceId)).toEqual(['device-candidate-ghost'])
  resetHooksRuntimeOptions()
  resetConnectionRuntime()
})

test('startDiscovery maps successful probe to canonical device id', async () => {
  configureHooksRuntime({
    adapterFactory: () =>
      createProbeFilterAdapter({
        results: [
          {
            host: '192.168.77.97',
            port: 32100,
            ok: true,
            wireSourceDeviceId: 'device-real-peer',
            displayName: 'Synra Desktop'
          }
        ]
      })
  })
  resetConnectionRuntime()
  const transport = useTransport()
  await transport.ensureReady()
  await transport.startScan()
  expect(transport.peers.value.length).toBe(1)
  expect(transport.peers.value[0]?.deviceId).toBe('device-real-peer')
  expect(transport.peers.value[0]?.connectable).toBe(true)
  expect(transport.peers.value[0]?.source).toBe('probe')
  resetHooksRuntimeOptions()
  resetConnectionRuntime()
})

test('startDiscovery keeps discovery silent when probe call fails', async () => {
  const adapter = createProbeFilterAdapter({
    results: []
  })
  adapter.probeSynraPeers = async () => {
    throw new Error('targets is required.')
  }
  configureHooksRuntime({
    adapterFactory: () => adapter
  })
  resetConnectionRuntime()
  const transport = useTransport()
  await transport.ensureReady()
  await transport.startScan()
  expect(transport.peers.value).toEqual([])
  expect(transport.error.value).toBeNull()
  resetHooksRuntimeOptions()
  resetConnectionRuntime()
})
