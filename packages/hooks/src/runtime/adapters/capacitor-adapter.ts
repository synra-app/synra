import { DeviceConnection } from '@synra/capacitor-device-connection'
import { LanDiscovery } from '@synra/capacitor-lan-discovery'
import type { ConnectionRuntimeAdapter } from '../adapter'
import { normalizeHostKey } from '../host-normalization'

type OutboundSessionMeta = {
  deviceId: string
  host: string
  port: number
  direction: 'inbound' | 'outbound'
}

export function createCapacitorRuntimeAdapter(): ConnectionRuntimeAdapter {
  const outboundSessionMetaById = new Map<string, OutboundSessionMeta>()
  const pendingOutboundMetaByRemote = new Map<string, OutboundSessionMeta>()

  const adapter: ConnectionRuntimeAdapter = {
    startDiscovery: (options) => LanDiscovery.startDiscovery(options),
    listDiscoveredDevices: () => LanDiscovery.getDiscoveredDevices(),
    probeSynraPeers: (options) => DeviceConnection.probeSynraPeers(options),
    openSession: async (options) => {
      const pendingMeta: OutboundSessionMeta = {
        deviceId: options.deviceId,
        host: options.host,
        port: options.port,
        direction: 'outbound'
      }
      const pendingKey = normalizeHostKey(options.host, options.port)
      pendingOutboundMetaByRemote.set(pendingKey, pendingMeta)

      const result = await DeviceConnection.openSession(options)
      outboundSessionMetaById.set(result.sessionId, pendingMeta)
      pendingOutboundMetaByRemote.delete(pendingKey)
      return result
    },
    closeSession: async (sessionId) => {
      if (sessionId) {
        outboundSessionMetaById.delete(sessionId)
      }
      await DeviceConnection.closeSession({ sessionId })
    },
    sendMessage: async (options) => {
      await DeviceConnection.sendMessage(options)
    },
    sendLanEvent: async (options) => {
      await DeviceConnection.sendLanEvent(options)
    },
    getSessionState: async (sessionId) => DeviceConnection.getSessionState({ sessionId }),
    addDeviceConnectableUpdatedListener: async (listener) => {
      const forward = (event: { device: Parameters<typeof listener>[0]['device'] }) => {
        listener({ device: event.device })
      }
      const connectableHandle = await LanDiscovery.addListener('deviceConnectableUpdated', forward)
      const foundHandle = await LanDiscovery.addListener('deviceFound', forward)
      const updatedHandle = await LanDiscovery.addListener('deviceUpdated', forward)
      return {
        remove: async () => {
          await connectableHandle.remove()
          await foundHandle.remove()
          await updatedHandle.remove()
        }
      }
    },
    addDeviceLostListener: async (listener) =>
      LanDiscovery.addListener('deviceLost', (event) => {
        const lostPayload = event as { deviceId: string; ipAddress?: unknown }
        listener({
          deviceId: lostPayload.deviceId,
          ipAddress: typeof lostPayload.ipAddress === 'string' ? lostPayload.ipAddress : undefined
        })
      }),
    addSessionOpenedListener: async (listener) =>
      DeviceConnection.addListener('sessionOpened', (event) => {
        const metaBySessionId = event.sessionId
          ? outboundSessionMetaById.get(event.sessionId)
          : undefined
        const remoteKey =
          typeof event.host === 'string' && typeof event.port === 'number'
            ? normalizeHostKey(event.host, event.port)
            : undefined
        const pendingMeta = remoteKey ? pendingOutboundMetaByRemote.get(remoteKey) : undefined
        const meta = metaBySessionId ?? pendingMeta
        const normalizedDirection: 'inbound' | 'outbound' =
          event.direction === 'inbound' ? 'inbound' : 'outbound'
        if (event.sessionId && meta) {
          outboundSessionMetaById.set(event.sessionId, {
            deviceId: meta.deviceId,
            host: meta.host,
            port: meta.port,
            direction: normalizedDirection
          })
        }
        if (remoteKey && pendingMeta) {
          pendingOutboundMetaByRemote.delete(remoteKey)
        }
        if (normalizedDirection === 'inbound' && (!event.deviceId || event.deviceId.length === 0)) {
          return
        }
        listener({
          ...event,
          deviceId: meta?.deviceId ?? event.deviceId,
          direction: normalizedDirection,
          transport: event.transport ?? 'tcp',
          host: typeof event.host === 'string' && event.host.length > 0 ? event.host : meta?.host,
          port: typeof event.port === 'number' ? event.port : meta?.port,
          displayName:
            typeof event.displayName === 'string' && event.displayName.length > 0
              ? event.displayName
              : undefined,
          incomingSynraConnectPayload:
            event.incomingSynraConnectPayload &&
            typeof event.incomingSynraConnectPayload === 'object'
              ? (event.incomingSynraConnectPayload as Record<string, unknown>)
              : undefined,
          connectAckPayload:
            event.connectAckPayload && typeof event.connectAckPayload === 'object'
              ? (event.connectAckPayload as Record<string, unknown>)
              : undefined
        })
      }),
    addSessionClosedListener: async (listener) =>
      DeviceConnection.addListener('sessionClosed', (event) => {
        if (event.sessionId) {
          outboundSessionMetaById.delete(event.sessionId)
        }
        listener(event)
      }),
    addMessageReceivedListener: async (listener) =>
      DeviceConnection.addListener('messageReceived', listener),
    addMessageAckListener: (listener) => DeviceConnection.addListener('messageAck', listener),
    addTransportErrorListener: async (listener) =>
      DeviceConnection.addListener('transportError', listener),
    addLanWireEventReceivedListener: async (listener) =>
      DeviceConnection.addListener('lanWireEventReceived', listener)
  }

  return adapter
}
