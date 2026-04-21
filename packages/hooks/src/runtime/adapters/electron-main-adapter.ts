import type {
  DeviceConnectableUpdatedEvent,
  DiscoveryState,
  DiscoveredDevice,
  StartDiscoveryOptions
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

function normalizeTransportErrorMessage(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload
  }
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message?: unknown }).message
    if (typeof message === 'string') {
      return message
    }
    return JSON.stringify(message ?? 'Transport error')
  }
  return 'Transport error'
}

function createNoopHandle() {
  return {
    remove: async () => {}
  }
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
      _listener: (event: DeviceConnectableUpdatedEvent) => void
    ) => createNoopHandle(),
    addDeviceLostListener: async (listener) =>
      addHostListener((event) => {
        if (event.type !== 'host.member.offline') {
          return
        }
        const payload =
          event.payload && typeof event.payload === 'object'
            ? (event.payload as Record<string, unknown>)
            : {}
        const deviceId =
          typeof payload.deviceId === 'string' && payload.deviceId.length > 0
            ? payload.deviceId
            : undefined
        if (!deviceId) {
          return
        }
        listener({
          deviceId,
          ipAddress:
            typeof payload.sourceHostIp === 'string' && payload.sourceHostIp.length > 0
              ? payload.sourceHostIp
              : undefined
        })
      }),
    addSessionOpenedListener: async (listener: (event: SessionOpenedEvent) => void) =>
      addHostListener((event) => {
        if (event.type === 'transport.session.opened' && event.sessionId) {
          const pl =
            event.payload && typeof event.payload === 'object'
              ? (event.payload as Record<string, unknown>)
              : {}
          const hostFromPayload = typeof pl.host === 'string' ? pl.host : undefined
          const portFromPayload = typeof pl.port === 'number' ? pl.port : undefined
          const deviceId = typeof pl.deviceId === 'string' ? pl.deviceId : undefined
          const direction =
            pl.direction === 'inbound' || pl.direction === 'outbound' ? pl.direction : undefined
          const displayName = typeof pl.displayName === 'string' ? pl.displayName : undefined
          const fallbackRemote = typeof event.remote === 'string' ? event.remote : ''
          const [hostPart, portText] = fallbackRemote.split(':')
          const parsedRemotePort = Number.parseInt(portText ?? '', 10)
          listener({
            sessionId: event.sessionId,
            deviceId,
            direction,
            host: hostFromPayload ?? (hostPart.length > 0 ? hostPart : undefined),
            port: Number.isFinite(portFromPayload)
              ? portFromPayload
              : Number.isFinite(parsedRemotePort)
                ? parsedRemotePort
                : undefined,
            displayName: displayName && displayName.length > 0 ? displayName : undefined,
            transport: event.transport ?? 'tcp'
          })
        }
      }),
    addSessionClosedListener: async (listener: (event: SessionClosedEvent) => void) =>
      addHostListener((event) => {
        if (event.type === 'transport.session.closed') {
          listener({
            sessionId: event.sessionId,
            reason: 'peer-closed',
            transport: event.transport
          })
        }
      }),
    addMessageReceivedListener: async (listener: (event: MessageReceivedEvent) => void) =>
      addHostListener((event) => {
        if (event.type === 'transport.message.received' && event.sessionId) {
          listener({
            sessionId: event.sessionId,
            messageId: event.messageId,
            messageType: (event.messageType ??
              'transport.message.received') as SendMessageOptions['messageType'],
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
        if (event.type === 'transport.error') {
          listener({
            sessionId: event.sessionId,
            code: event.code,
            message: normalizeTransportErrorMessage(event.payload),
            transport: event.transport
          })
        }
      })
  }
}
