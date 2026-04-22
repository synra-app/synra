import { expect, test } from 'vite-plus/test'
import type {
  DiscoveredDevice,
  DeviceConnectableUpdatedEvent
} from '@synra/capacitor-lan-discovery'
import type {
  GetSessionStateResult,
  MessageAckEvent,
  MessageReceivedEvent,
  OpenSessionOptions,
  SendMessageOptions,
  SessionClosedEvent,
  SessionOpenedEvent,
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
      source: 'manual',
      connectable: true,
      discoveredAt: Date.now(),
      lastSeenAt: Date.now()
    }
  ]

  let sessionOpenedListener: ((event: SessionOpenedEvent) => void) | undefined
  let messageListener: ((event: MessageReceivedEvent) => void) | undefined

  return {
    async startDiscovery() {
      return { state: 'scanning', devices }
    },
    async openSession(options: OpenSessionOptions) {
      const event: SessionOpenedEvent = {
        sessionId: `session-${options.deviceId}`,
        deviceId: options.deviceId,
        host: options.host,
        port: options.port,
        transport: 'tcp',
        direction: 'inbound'
      }
      sessionOpenedListener?.(event)
      return { sessionId: event.sessionId, state: 'open', transport: 'tcp' }
    },
    async closeSession() {},
    async sendMessage(options: SendMessageOptions) {
      messageListener?.({
        sessionId: options.sessionId,
        messageType: options.messageType,
        payload: options.payload,
        timestamp: Date.now(),
        transport: 'tcp',
        messageId: options.messageId
      })
    },
    async getSessionState(_sessionId?: string): Promise<GetSessionStateResult> {
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
    async addSessionOpenedListener(listener: (event: SessionOpenedEvent) => void) {
      sessionOpenedListener = listener
      return { remove: async () => {} }
    },
    async addSessionClosedListener(_listener: (event: SessionClosedEvent) => void) {
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
    invalidateHandoffForHostKeys() {}
  }
}

test('useTransport exposes minimal messaging capabilities', async () => {
  configureHooksRuntime({ adapterFactory: () => createMockAdapter() })
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

test('startScan clears peer list when discovery returns empty', async () => {
  let scanCount = 0
  configureHooksRuntime({
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
                source: 'mdns',
                connectable: true,
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
      async openSession() {
        throw new Error('should not probe-verify on empty scan')
      },
      async closeSession() {},
      async sendMessage() {},
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
      invalidateHandoffForHostKeys() {}
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
