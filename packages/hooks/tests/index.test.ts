import { expect, test } from 'vite-plus/test'
import type {
  DiscoveredDevice,
  DeviceConnectableUpdatedEvent
} from '@synra/capacitor-lan-discovery'
import type {
  GetTransportStateResult,
  LanWireEventReceivedEvent,
  MessageAckEvent,
  MessageReceivedEvent,
  OpenTransportOptions,
  SendLanEventOptions,
  SendMessageOptions,
  TransportClosedEvent,
  TransportOpenedEvent,
  TransportErrorEvent
} from '@synra/capacitor-device-connection'
import {
  configureHooksRuntime,
  resetConnectionRuntime,
  resetHooksRuntimeOptions,
  useTransport
} from '../src/index'
import type { ConnectionRuntimeAdapter, DeviceLostEvent } from '../src/runtime/adapter'

function createMockAdapter(): ConnectionRuntimeAdapter {
  const devices: DiscoveredDevice[] = [
    {
      deviceId: 'device-a',
      name: 'Device A',
      ipAddress: '127.0.0.1',
      source: 'probe',
      connectable: true,
      connectCheckAt: Date.now(),
      discoveredAt: Date.now(),
      lastSeenAt: Date.now()
    }
  ]

  let sessionOpenedListener: ((event: TransportOpenedEvent) => void) | undefined
  let messageListener: ((event: MessageReceivedEvent) => void) | undefined

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
        direction: 'inbound'
      }
      sessionOpenedListener?.(event)
      return { deviceId: event.deviceId, state: 'open', transport: 'tcp' }
    },
    async closeTransport() {},
    async sendMessage(options: SendMessageOptions) {
      messageListener?.({
        requestId: options.requestId,
        sourceDeviceId: options.sourceDeviceId,
        targetDeviceId: options.targetDeviceId,
        replyToRequestId: options.replyToRequestId,
        messageType: options.messageType,
        payload: options.payload,
        timestamp: Date.now(),
        transport: 'tcp',
        messageId: options.messageId
      })
    },
    async sendLanEvent(_options: SendLanEventOptions) {},
    async getTransportState(_deviceId?: string): Promise<GetTransportStateResult> {
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
    async addTransportOpenedListener(listener: (event: TransportOpenedEvent) => void) {
      sessionOpenedListener = listener
      return { remove: async () => {} }
    },
    async addTransportClosedListener(_listener: (event: TransportClosedEvent) => void) {
      return { remove: async () => {} }
    },
    async addMessageReceivedListener(listener: (event: MessageReceivedEvent) => void) {
      messageListener = listener
      return { remove: async () => {} }
    },
    async addMessageAckListener(_listener: (event: MessageAckEvent) => void) {
      return { remove: async () => {} }
    },
    async addTransportErrorListener(_listener: (event: TransportErrorEvent) => void) {
      return { remove: async () => {} }
    },
    async addLanWireEventReceivedListener(_listener: (event: LanWireEventReceivedEvent) => void) {
      return { remove: async () => {} }
    }
  }
}

test('useTransport exposes minimal messaging capabilities', async () => {
  configureHooksRuntime({
    adapterFactory: () => createMockAdapter(),
    resolveSynraConnectType: () => 'paired'
  })
  resetConnectionRuntime()
  const transport = useTransport()
  await transport.ensureReady()
  await transport.startScan()
  expect(transport.peers.value.length).toBe(1)

  const seen: unknown[] = []
  const cleanup = transport.onMessage((message) => {
    seen.push(message.payload)
  })
  await transport.sendToDevice('device-a', { payload: 'hello', channel: 'default' })
  cleanup()
  expect(seen.length).toBe(1)
})

test('cleanup runtime options', () => {
  resetHooksRuntimeOptions()
  resetConnectionRuntime()
})

test('transport error closes connected session state', async () => {
  let sessionOpenedListener: ((event: TransportOpenedEvent) => void) | undefined
  let transportErrorListener: ((event: TransportErrorEvent) => void) | undefined

  configureHooksRuntime({
    resolveSynraConnectType: () => 'paired',
    adapterFactory: () => ({
      async startDiscovery() {
        return {
          state: 'scanning' as const,
          devices: [
            {
              deviceId: 'device-a',
              name: 'Device A',
              ipAddress: '192.168.1.10',
              source: 'probe' as const,
              connectable: true,
              connectCheckAt: Date.now(),
              discoveredAt: Date.now(),
              lastSeenAt: Date.now()
            }
          ]
        }
      },
      async listDiscoveredDevices() {
        return {
          state: 'scanning' as const,
          devices: [
            {
              deviceId: 'device-a',
              name: 'Device A',
              ipAddress: '192.168.1.10',
              source: 'probe' as const,
              connectable: true,
              connectCheckAt: Date.now(),
              discoveredAt: Date.now(),
              lastSeenAt: Date.now()
            }
          ]
        }
      },
      async openTransport(options: OpenTransportOptions) {
        const openedEvent: TransportOpenedEvent = {
          deviceId: options.deviceId,
          host: options.host,
          port: options.port,
          transport: 'tcp',
          direction: 'outbound'
        }
        sessionOpenedListener?.(openedEvent)
        return { deviceId: openedEvent.deviceId, state: 'open', transport: 'tcp' as const }
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
      async addTransportErrorListener(listener: (event: TransportErrorEvent) => void) {
        transportErrorListener = listener
        return { remove: async () => {} }
      },
      async addLanWireEventReceivedListener() {
        return { remove: async () => {} }
      }
    })
  })
  resetConnectionRuntime()
  const transport = useTransport()
  await transport.ensureReady()
  await transport.startScan()
  await transport.connectToDevice('device-a')
  expect(transport.transportReadyDeviceIds.value).toContain('device-a')

  transportErrorListener?.({
    deviceId: 'device-a',
    code: 'SOCKET_CLOSED',
    message: 'socket closed',
    transport: 'tcp'
  })

  expect(transport.transportReadyDeviceIds.value).not.toContain('device-a')
  expect(
    transport.connectedSessions.value.find((session) => session.deviceId === 'device-a')
  ).toMatchObject({ transport: 'dead' })
})

test('startScan clears peer list when discovery returns empty', async () => {
  let scanCount = 0
  configureHooksRuntime({
    resolveSynraConnectType: () => 'paired',
    adapterFactory: () => ({
      async startDiscovery() {
        scanCount += 1
        if (scanCount === 1) {
          return {
            state: 'scanning',
            devices: [
              {
                deviceId: 'device-a',
                name: 'Device A',
                ipAddress: '192.168.1.10',
                source: 'probe',
                connectable: true,
                connectCheckAt: Date.now(),
                discoveredAt: Date.now(),
                lastSeenAt: Date.now()
              }
            ]
          }
        }
        return {
          state: 'scanning',
          devices: []
        }
      },
      async listDiscoveredDevices() {
        return { state: 'scanning' as const, devices: [] }
      },
      async openTransport() {
        throw new Error('should not probe-verify on empty scan')
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
    })
  })
  resetConnectionRuntime()
  const transport = useTransport()
  await transport.ensureReady()
  await transport.startScan()
  expect(transport.peers.value.map((peer) => peer.deviceId)).toEqual(['device-a'])

  await transport.startScan()
  expect(transport.peers.value).toEqual([])
})

test('session is not open error marks transport dead and reconnects', async () => {
  let openCounter = 0
  let sessionOpenedListener: ((event: TransportOpenedEvent) => void) | undefined
  configureHooksRuntime({
    resolveSynraConnectType: () => 'fresh',
    adapterFactory: () => ({
      async startDiscovery() {
        return {
          state: 'scanning' as const,
          devices: [
            {
              deviceId: 'device-a',
              name: 'Device A',
              ipAddress: '192.168.1.10',
              source: 'probe' as const,
              connectable: true,
              connectCheckAt: Date.now(),
              discoveredAt: Date.now(),
              lastSeenAt: Date.now()
            }
          ]
        }
      },
      async listDiscoveredDevices() {
        return {
          state: 'scanning' as const,
          devices: [
            {
              deviceId: 'device-a',
              name: 'Device A',
              ipAddress: '192.168.1.10',
              source: 'probe' as const,
              connectable: true,
              connectCheckAt: Date.now(),
              discoveredAt: Date.now(),
              lastSeenAt: Date.now()
            }
          ]
        }
      },
      async openTransport(options: OpenTransportOptions) {
        openCounter += 1
        sessionOpenedListener?.({
          deviceId: options.deviceId,
          host: options.host,
          port: options.port,
          transport: 'tcp',
          direction: 'outbound'
        })
        return {
          deviceId: options.deviceId,
          state: 'open',
          transport: 'tcp'
        }
      },
      async closeTransport() {},
      async sendMessage() {},
      async sendLanEvent() {
        throw new Error('Session is not open.')
      },
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
      }
    })
  })
  resetConnectionRuntime()
  const transport = useTransport()
  await transport.ensureReady()
  await transport.startScan()

  const firstDeviceId = await transport.connectToDevice('device-a')
  expect(firstDeviceId).toBe('device-a')
  await expect(
    transport.sendLanEvent({
      requestId: 'r1',
      sourceDeviceId: 'device-self',
      targetDeviceId: 'device-a',
      eventName: 'pairing.request',
      payload: { requestId: 'r1' }
    })
  ).rejects.toThrow('Session is not open.')

  const secondDeviceId = await transport.connectToDevice('device-a')
  expect(secondDeviceId).toBe('device-a')
  expect(openCounter).toBeGreaterThanOrEqual(1)
})
