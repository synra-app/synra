import type {
  DeviceConnectableUpdatedEvent,
  DiscoveredDevice,
  DiscoveryState,
  ListDiscoveredDevicesResult,
  StartDiscoveryOptions
} from '@synra/capacitor-lan-discovery'
import {
  discoveredDeviceFromHostEvent,
  lostDeviceFromHostEvent
} from '@synra/capacitor-lan-discovery'
import type {
  GetTransportStateResult,
  HostEvent,
  LanWireEventReceivedEvent,
  MessageAckEvent,
  MessageReceivedEvent,
  OpenTransportOptions,
  ProbeSynraPeersOptions,
  ProbeSynraPeersResult,
  SendLanEventOptions,
  SendMessageOptions,
  TransportState,
  TransportClosedEvent,
  TransportOpenedEvent,
  TransportErrorEvent
} from '@synra/capacitor-device-connection'
import { SYNRA_PROBE_EMBEDDED_IN_DISCOVERY } from '@synra/capacitor-device-connection'
import type { ConnectionRuntimeAdapter } from '../adapter'
import {
  mapLanWireEventReceivedHostEvent,
  mapMessageTypeFromHostEvent,
  mapTransportClosedHostEvent,
  mapTransportOpenedHostEvent,
  mapTransportErrorHostEvent
} from './electron-host-event-mappers'

type MainHooksBridge = {
  startDiscovery: (options?: StartDiscoveryOptions) => Promise<{
    state: DiscoveryState
    devices: DiscoveredDevice[]
  }>
  listDiscoveredDevices: () => Promise<ListDiscoveredDevicesResult>
  openTransport: (
    options: OpenTransportOptions
  ) => Promise<{ deviceId: string; state: TransportState; transport: 'tcp' }>
  closeTransport: (deviceId?: string) => Promise<unknown>
  sendMessage: (options: SendMessageOptions) => Promise<unknown>
  sendLanEvent: (options: SendLanEventOptions) => Promise<unknown>
  getTransportState: (deviceId?: string) => Promise<GetTransportStateResult>
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
    listDiscoveredDevices: () => bridge.listDiscoveredDevices(),
    probeSynraPeers: async (options: ProbeSynraPeersOptions): Promise<ProbeSynraPeersResult> => ({
      results: options.targets.map((target) => ({
        host: target.host,
        port: typeof target.port === 'number' && target.port > 0 ? target.port : 32100,
        ok: false,
        error: SYNRA_PROBE_EMBEDDED_IN_DISCOVERY
      }))
    }),
    openTransport: (options) => bridge.openTransport(options),
    closeTransport: async (deviceId) => {
      await bridge.closeTransport(deviceId)
    },
    sendMessage: async (options) => {
      await bridge.sendMessage(options)
    },
    sendLanEvent: async (options) => {
      await bridge.sendLanEvent(options)
    },
    getTransportState: (deviceId) => bridge.getTransportState(deviceId),
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
    addTransportOpenedListener: async (listener: (event: TransportOpenedEvent) => void) =>
      addHostListener((event) => {
        const mapped = mapTransportOpenedHostEvent(event)
        if (mapped) {
          listener(mapped)
        }
      }),
    addTransportClosedListener: async (listener: (event: TransportClosedEvent) => void) =>
      addHostListener((event) => {
        const mapped = mapTransportClosedHostEvent(event)
        if (mapped) {
          listener(mapped)
        }
      }),
    addMessageReceivedListener: async (listener: (event: MessageReceivedEvent) => void) =>
      addHostListener((event) => {
        if (event.type === 'transport.message.received') {
          const payload =
            event.payload && typeof event.payload === 'object'
              ? (event.payload as Record<string, unknown>)
              : {}
          const requestId = typeof payload.requestId === 'string' ? payload.requestId : ''
          const from =
            typeof payload.from === 'string'
              ? payload.from
              : typeof event.from === 'string'
                ? event.from
                : ''
          const target =
            typeof payload.target === 'string'
              ? payload.target
              : typeof event.target === 'string'
                ? event.target
                : ''
          if (!requestId || !from || !target) {
            return
          }
          listener({
            requestId,
            from,
            target,
            replyRequestId:
              typeof payload.replyRequestId === 'string'
                ? payload.replyRequestId
                : event.replyRequestId,
            event:
              mapMessageTypeFromHostEvent(event) ??
              ('transport.message.received' as SendMessageOptions['event']),
            payload: 'payload' in payload ? payload.payload : event.payload,
            timestamp: event.timestamp,
            transport: event.transport
          })
        }
      }),
    addMessageAckListener: async (listener: (event: MessageAckEvent) => void) =>
      addHostListener((event) => {
        if (event.type === 'transport.message.ack' && event.replyRequestId) {
          const payload =
            event.payload && typeof event.payload === 'object'
              ? (event.payload as Record<string, unknown>)
              : {}
          const requestId = typeof payload.requestId === 'string' ? payload.requestId : ''
          const target = typeof event.target === 'string' ? event.target : ''
          if (!requestId || !target) {
            return
          }
          listener({
            target,
            event: event.event,
            from: event.from,
            replyRequestId: event.replyRequestId,
            requestId,
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
      }),
    addLanWireEventReceivedListener: async (listener: (event: LanWireEventReceivedEvent) => void) =>
      addHostListener((event) => {
        const mapped = mapLanWireEventReceivedHostEvent(event)
        if (mapped) {
          listener(mapped)
        }
      })
  }
}
