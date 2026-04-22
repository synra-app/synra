import type {
  DeviceConnectableUpdatedEvent,
  DiscoveredDevice,
  DiscoveryState,
  StartDiscoveryOptions
} from '@synra/capacitor-lan-discovery'
import {
  discoveredDeviceFromHostEvent,
  lostDeviceFromHostEvent
} from '@synra/capacitor-lan-discovery'
import type {
  GetSessionStateResult,
  HostEvent,
  MessageAckEvent,
  MessageReceivedEvent,
  OpenSessionOptions,
  SendMessageOptions,
  SessionState,
  SessionClosedEvent,
  SessionOpenedEvent,
  TransportErrorEvent
} from '@synra/capacitor-device-connection'
import type { ConnectionRuntimeAdapter } from '../adapter'
import {
  mapMessageTypeFromHostEvent,
  mapSessionClosedHostEvent,
  mapSessionOpenedHostEvent,
  mapTransportErrorHostEvent
} from './electron-host-event-mappers'

type MainHooksBridge = {
  startDiscovery: (options?: StartDiscoveryOptions) => Promise<{
    state: DiscoveryState
    devices: DiscoveredDevice[]
  }>
  openSession: (
    options: OpenSessionOptions
  ) => Promise<{ sessionId: string; state: SessionState; transport: 'tcp' }>
  closeSession: (sessionId?: string) => Promise<unknown>
  sendMessage: (options: SendMessageOptions) => Promise<unknown>
  getSessionState: (sessionId?: string) => Promise<GetSessionStateResult>
  onHostEvent: (listener: (event: HostEvent) => void) => () => void
}

type MainHooksGlobal = typeof globalThis & {
  __synraHooksMainBridge?: MainHooksBridge
}

export function createElectronMainRuntimeAdapter(): ConnectionRuntimeAdapter {
  const bridge = (globalThis as MainHooksGlobal).__synraHooksMainBridge
  if (!bridge) {
    throw new Error('Electron main bridge is not installed on globalThis.__synraHooksMainBridge.')
  }

  const hostEventListeners = new Set<(event: HostEvent) => void>()
  bridge.onHostEvent((event) => {
    for (const listener of hostEventListeners) {
      listener(event)
    }
  })

  const addHostListener = (listener: (event: HostEvent) => void) => {
    hostEventListeners.add(listener)
    return {
      remove: async () => {
        hostEventListeners.delete(listener)
      }
    }
  }

  return {
    startDiscovery: (options) => bridge.startDiscovery(options),
    openSession: (options) => bridge.openSession(options),
    closeSession: async (sessionId) => {
      await bridge.closeSession(sessionId)
    },
    sendMessage: async (options) => {
      await bridge.sendMessage(options)
    },
    getSessionState: (sessionId) => bridge.getSessionState(sessionId),
    addDeviceConnectableUpdatedListener: async (
      listener: (event: DeviceConnectableUpdatedEvent) => void
    ) =>
      addHostListener((event) => {
        const discovered = discoveredDeviceFromHostEvent(event)
        if (!discovered) {
          return
        }
        listener({ device: discovered })
      }),
    addDeviceLostListener: async (listener) =>
      addHostListener((event) => {
        const lost = lostDeviceFromHostEvent(event)
        if (!lost) {
          return
        }
        listener({
          deviceId: lost.deviceId,
          ipAddress: lost.ipAddress
        })
      }),
    addSessionOpenedListener: async (listener: (event: SessionOpenedEvent) => void) =>
      addHostListener((event) => {
        const mapped = mapSessionOpenedHostEvent(event)
        if (mapped) {
          listener(mapped)
        }
      }),
    addSessionClosedListener: async (listener: (event: SessionClosedEvent) => void) =>
      addHostListener((event) => {
        const mapped = mapSessionClosedHostEvent(event)
        if (mapped) {
          listener(mapped)
        }
      }),
    addMessageReceivedListener: async (listener: (event: MessageReceivedEvent) => void) =>
      addHostListener((event) => {
        if (event.type === 'transport.message.received' && event.sessionId) {
          listener({
            sessionId: event.sessionId,
            messageId: event.messageId,
            messageType:
              mapMessageTypeFromHostEvent(event) ??
              ('transport.message.received' as SendMessageOptions['messageType']),
            payload:
              event.payload && typeof event.payload === 'object' && 'payload' in event.payload
                ? (event.payload as { payload: unknown }).payload
                : event.payload,
            timestamp: event.timestamp,
            transport: event.transport
          })
        }
      }),
    addMessageAckListener: async (listener: (event: MessageAckEvent) => void) =>
      addHostListener((event) => {
        if (event.type === 'transport.message.ack' && event.sessionId && event.messageId) {
          listener({
            sessionId: event.sessionId,
            messageId: event.messageId,
            timestamp: event.timestamp,
            transport: event.transport
          })
        }
      }),
    addTransportErrorListener: async (listener: (event: TransportErrorEvent) => void) =>
      addHostListener((event) => {
        const mapped = mapTransportErrorHostEvent(event)
        if (mapped) {
          listener(mapped)
        }
      })
  }
}
