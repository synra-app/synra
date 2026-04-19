import { expect, test } from 'vite-plus/test'
import { nextTick } from 'vue'
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
  useConnection,
  useConnectionState,
  useDevice,
  useDiscovery
} from '../src/index'
import type { ConnectionRuntimeAdapter } from '../src/runtime/adapter'

function createMockAdapter(): ConnectionRuntimeAdapter {
  const listeners = {
    messageReceived: new Set<(event: MessageReceivedEvent) => void>(),
    sessionOpened: new Set<(event: SessionOpenedEvent) => void>(),
    sessionClosed: new Set<(event: SessionClosedEvent) => void>(),
    messageAck: new Set<(event: MessageAckEvent) => void>(),
    transportError: new Set<(event: TransportErrorEvent) => void>(),
    deviceConnectableUpdated: new Set<(event: DeviceConnectableUpdatedEvent) => void>()
  }

  const devices: DiscoveredDevice[] = [
    {
      deviceId: 'device-1',
      name: 'Device 1',
      ipAddress: '127.0.0.1',
      source: 'manual',
      paired: true,
      connectable: true,
      discoveredAt: Date.now(),
      lastSeenAt: Date.now()
    }
  ]

  return {
    async getDiscoveredDevices() {
      return {
        state: 'idle',
        startedAt: undefined,
        scanWindowMs: 15_000,
        devices
      }
    },
    async startDiscovery(_options) {
      return {
        state: 'scanning',
        startedAt: Date.now(),
        scanWindowMs: 15_000,
        devices
      }
    },
    async stopDiscovery() {},
    async pairDevice(deviceId: string) {
      return {
        device: {
          ...devices[0],
          deviceId
        }
      }
    },
    async probeConnectable(_port: number, _timeoutMs: number) {
      return { devices }
    },
    async openSession(_options: OpenSessionOptions) {
      return {
        sessionId: 'session-open',
        state: 'open',
        transport: 'tcp'
      }
    },
    async closeSession(_sessionId?: string) {},
    async sendMessage(_options: SendMessageOptions) {},
    async getSessionState(_sessionId?: string): Promise<GetSessionStateResult> {
      return { state: 'idle', transport: 'tcp' as const }
    },
    async pullHostEvents() {
      return { events: [] }
    },
    async addDeviceConnectableUpdatedListener(listener) {
      listeners.deviceConnectableUpdated.add(listener)
      return {
        remove: async () => {
          listeners.deviceConnectableUpdated.delete(listener)
        }
      }
    },
    async addSessionOpenedListener(listener) {
      listeners.sessionOpened.add(listener)
      return {
        remove: async () => {
          listeners.sessionOpened.delete(listener)
        }
      }
    },
    async addSessionClosedListener(listener) {
      listeners.sessionClosed.add(listener)
      return {
        remove: async () => {
          listeners.sessionClosed.delete(listener)
        }
      }
    },
    async addMessageReceivedListener(listener) {
      listeners.messageReceived.add(listener)
      return {
        remove: async () => {
          listeners.messageReceived.delete(listener)
        }
      }
    },
    async addMessageAckListener(listener) {
      listeners.messageAck.add(listener)
      return {
        remove: async () => {
          listeners.messageAck.delete(listener)
        }
      }
    },
    async addTransportErrorListener(listener) {
      listeners.transportError.add(listener)
      return {
        remove: async () => {
          listeners.transportError.delete(listener)
        }
      }
    }
  }
}

function setupMockRuntime(): void {
  configureHooksRuntime({
    adapterFactory: () => createMockAdapter()
  })
  resetConnectionRuntime()
}

test('useDevice should return null for unknown deviceId', async () => {
  setupMockRuntime()
  const discovery = useDiscovery()
  await discovery.refreshDevices()
  const { device } = useDevice('unknown-device')
  expect(device.value).toBeNull()
})

test('useConnectionState activeSessions should react to status updates', async () => {
  setupMockRuntime()
  const connection = useConnectionState()
  await connection.openSession({
    deviceId: 'device-1',
    host: '127.0.0.1',
    port: 32100
  })
  expect(connection.activeSessions.value).toHaveLength(1)

  await connection.closeSession('session-open')
  expect(connection.activeSessions.value).toHaveLength(0)
})

test('useConnection onMessage receives messages after ensureListeners', async () => {
  setupMockRuntime()
  const connection = useConnection()
  const seen: string[] = []
  connection.onMessage((message) => {
    seen.push(String(message.payload))
  })
  await connection.ensureListeners()

  const state = useConnectionState()
  await state.openSession({
    deviceId: 'device-1',
    host: '127.0.0.1',
    port: 32100
  })

  await connection.sendMessage({
    sessionId: 'session-open',
    messageType: 'custom.chat.text',
    payload: 'hello'
  })
  await nextTick()
  expect(seen).toEqual([])
})

test('cleanup runtime options', () => {
  resetHooksRuntimeOptions()
  resetConnectionRuntime()
})
