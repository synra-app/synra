import { expect, test } from 'vite-plus/test'
import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import type { GetSessionStateResult, OpenSessionOptions } from '@synra/capacitor-device-connection'
import {
  configureHooksRuntime,
  resetConnectionRuntime,
  resetHooksRuntimeOptions,
  useTransport
} from '../src/index'
import type { ConnectionRuntimeAdapter } from '../src/runtime/adapter'

function createStaticScanAdapter(devices: DiscoveredDevice[]): ConnectionRuntimeAdapter {
  return {
    async startDiscovery() {
      return { state: 'scanning' as const, devices: [...devices], requestId: 'r1' }
    },
    async listDiscoveredDevices() {
      return { state: 'scanning' as const, devices: [...devices] }
    },
    async openSession(_options: OpenSessionOptions) {
      return { deviceId: _options.deviceId, state: 'open' as const, transport: 'tcp' as const }
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

test('startDiscovery omits device matching localDiscoveryDeviceId', async () => {
  const selfRow: DiscoveredDevice = {
    deviceId: 'device-aaaaaaaaaaaa',
    name: 'This machine',
    ipAddress: '192.168.1.2',
    source: 'probe',
    connectable: true,
    connectCheckAt: 1,
    discoveredAt: 1,
    lastSeenAt: 1
  }
  const peer: DiscoveredDevice = {
    deviceId: 'device-bbbbbbbbbbbb',
    name: 'Other',
    ipAddress: '192.168.1.3',
    source: 'probe',
    connectable: true,
    connectCheckAt: 1,
    discoveredAt: 1,
    lastSeenAt: 1
  }
  configureHooksRuntime({
    localDiscoveryDeviceId: selfRow.deviceId,
    adapterFactory: () => createStaticScanAdapter([selfRow, peer])
  })
  resetConnectionRuntime()
  const transport = useTransport()
  await transport.ensureReady()
  await transport.startScan()
  expect(transport.peers.value.map((p) => p.deviceId)).toEqual([peer.deviceId])
  resetHooksRuntimeOptions()
  resetConnectionRuntime()
})
