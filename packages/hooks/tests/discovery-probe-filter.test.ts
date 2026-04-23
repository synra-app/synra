import { expect, test } from 'vite-plus/test'
import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import type {
  GetSessionStateResult,
  OpenSessionOptions,
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
  source: 'mdns',
  connectable: false,
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
    async addSessionOpenedListener() {
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
