import type { SessionState } from '@synra/capacitor-device-connection'
import { DeviceConnection } from '@synra/capacitor-device-connection'
import { LanDiscovery } from '@synra/capacitor-lan-discovery'
import type { ConnectionRuntimeAdapter } from '../adapter'
import { normalizeHostKey } from '../host-normalization'

type ListenerHandle = {
  remove: () => Promise<void>
}

function combineListenerHandles(...handles: Array<ListenerHandle | undefined>): ListenerHandle {
  return {
    remove: async () => {
      const removers = handles
        .map((handle) => handle?.remove)
        .filter((remove): remove is () => Promise<void> => typeof remove === 'function')
      await Promise.all(removers.map((remove) => remove()))
    }
  }
}

type OutboundSessionMeta = {
  deviceId: string
  host: string
  port: number
  direction: 'inbound' | 'outbound'
}

export function createCapacitorRuntimeAdapter(): ConnectionRuntimeAdapter {
  /** Sessions whose TCP framing is owned by LanDiscovery (inbound or outbound). */
  const lanDiscoveryTransportSessionIds = new Set<string>()
  const outboundSessionMetaById = new Map<string, OutboundSessionMeta>()
  const pendingOutboundMetaByRemote = new Map<string, OutboundSessionMeta>()

  const adapter: ConnectionRuntimeAdapter = {
    startDiscovery: (options) => LanDiscovery.startDiscovery(options),
    openSession: async (options) => {
      const pendingMeta: OutboundSessionMeta = {
        deviceId: options.deviceId,
        host: options.host,
        port: options.port,
        direction: 'outbound'
      }
      const pendingKey = normalizeHostKey(options.host, options.port)
      pendingOutboundMetaByRemote.set(pendingKey, pendingMeta)

      const ensured = await LanDiscovery.ensureOutboundSession({
        host: options.host.trim(),
        port: options.port > 0 ? options.port : 32100,
        deviceId: options.deviceId,
        timeoutMs: 15_000
      })

      if ('sessionId' in ensured && ensured.sessionId.length > 0) {
        lanDiscoveryTransportSessionIds.add(ensured.sessionId)
        outboundSessionMetaById.set(ensured.sessionId, pendingMeta)
        pendingOutboundMetaByRemote.delete(pendingKey)
        const state: SessionState =
          ensured.state === 'connecting' || ensured.state === 'open' ? ensured.state : 'open'
        return { sessionId: ensured.sessionId, state, transport: 'tcp' }
      }

      pendingOutboundMetaByRemote.delete(pendingKey)
      const result = await DeviceConnection.openSession(options)
      outboundSessionMetaById.set(result.sessionId, pendingMeta)
      return result
    },
    closeSession: async (sessionId) => {
      if (sessionId) {
        outboundSessionMetaById.delete(sessionId)
      }
      if (sessionId && lanDiscoveryTransportSessionIds.has(sessionId)) {
        lanDiscoveryTransportSessionIds.delete(sessionId)
        await LanDiscovery.closeSession({ sessionId })
        return
      }
      await DeviceConnection.closeSession({ sessionId })
    },
    sendMessage: async (options) => {
      if (lanDiscoveryTransportSessionIds.has(options.sessionId)) {
        await LanDiscovery.sendMessage(options)
        return
      }
      await DeviceConnection.sendMessage(options)
    },
    getSessionState: async (sessionId) => {
      if (sessionId && lanDiscoveryTransportSessionIds.has(sessionId)) {
        const meta = outboundSessionMetaById.get(sessionId)
        return {
          sessionId,
          deviceId: meta?.deviceId,
          host: meta?.host,
          port: meta?.port,
          state: 'open',
          transport: 'tcp',
          direction: meta?.direction ?? 'outbound'
        }
      }
      return DeviceConnection.getSessionState({ sessionId })
    },
    addDeviceConnectableUpdatedListener: async (listener) => {
      const forward = (event: { device: Parameters<typeof listener>[0]['device'] }) => {
        listener({ device: event.device })
      }
      const connectableHandle = await LanDiscovery.addListener('deviceConnectableUpdated', forward)
      const foundHandle = await LanDiscovery.addListener('deviceFound', forward)
      const updatedHandle = await LanDiscovery.addListener('deviceUpdated', forward)
      return combineListenerHandles(connectableHandle, foundHandle, updatedHandle)
    },
    addDeviceLostListener: async (listener) =>
      LanDiscovery.addListener('deviceLost', (event) => {
        const lostPayload = event as { deviceId: string; ipAddress?: unknown }
        listener({
          deviceId: lostPayload.deviceId,
          ipAddress: typeof lostPayload.ipAddress === 'string' ? lostPayload.ipAddress : undefined
        })
      }),
    addSessionOpenedListener: async (listener) => {
      const connectionHandle = await DeviceConnection.addListener('sessionOpened', (event) => {
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
        const normalized = {
          ...event,
          deviceId: meta?.deviceId ?? event.deviceId,
          direction: normalizedDirection,
          transport: event.transport ?? 'tcp',
          host: typeof event.host === 'string' && event.host.length > 0 ? event.host : meta?.host,
          port: typeof event.port === 'number' ? event.port : meta?.port,
          displayName:
            typeof event.displayName === 'string' && event.displayName.length > 0
              ? event.displayName
              : undefined
        }
        listener({
          ...normalized
        })
      })
      const discoveryHandle = await LanDiscovery.addListener('sessionOpened', (event) => {
        if (!event.sessionId) {
          return
        }
        const rawDir = (event as { direction?: unknown }).direction
        const direction: 'inbound' | 'outbound' = rawDir === 'outbound' ? 'outbound' : 'inbound'

        const remoteKey =
          typeof event.host === 'string' && typeof event.port === 'number'
            ? normalizeHostKey(event.host, event.port)
            : undefined
        const pendingMeta = remoteKey ? pendingOutboundMetaByRemote.get(remoteKey) : undefined
        const metaFromEvent =
          typeof event.deviceId === 'string' &&
          event.deviceId.length > 0 &&
          typeof event.host === 'string' &&
          typeof event.port === 'number'
            ? {
                deviceId: event.deviceId,
                host: event.host,
                port: event.port,
                direction
              }
            : pendingMeta
        if (metaFromEvent) {
          outboundSessionMetaById.set(event.sessionId, metaFromEvent)
        }
        if (remoteKey && pendingMeta) {
          pendingOutboundMetaByRemote.delete(remoteKey)
        }

        lanDiscoveryTransportSessionIds.add(event.sessionId)

        if (direction === 'inbound' && (!event.deviceId || event.deviceId.length === 0)) {
          return
        }

        const pairedInbound = (event as { pairedPeerDeviceIds?: unknown }).pairedPeerDeviceIds
        const pairedPeerDeviceIds = Array.isArray(pairedInbound)
          ? pairedInbound.filter(
              (id): id is string => typeof id === 'string' && id.trim().length > 0
            )
          : undefined
        const rawHandshakeKind = (event as { handshakeKind?: unknown }).handshakeKind
        const handshakeKind =
          rawHandshakeKind === 'paired' || rawHandshakeKind === 'fresh'
            ? rawHandshakeKind
            : undefined
        const claimsPeerPairedRaw = (event as { claimsPeerPaired?: unknown }).claimsPeerPaired
        const claimsPeerPaired =
          typeof claimsPeerPairedRaw === 'boolean' ? claimsPeerPairedRaw : undefined
        listener({
          sessionId: event.sessionId,
          deviceId: metaFromEvent?.deviceId ?? event.deviceId,
          direction,
          transport: 'tcp',
          host: event.host,
          port: event.port,
          displayName:
            typeof event.displayName === 'string' && event.displayName.length > 0
              ? event.displayName
              : undefined,
          ...(pairedPeerDeviceIds !== undefined ? { pairedPeerDeviceIds } : {}),
          ...(handshakeKind ? { handshakeKind } : {}),
          ...(typeof claimsPeerPaired === 'boolean' ? { claimsPeerPaired } : {})
        })
      })
      return combineListenerHandles(connectionHandle, discoveryHandle)
    },
    addSessionClosedListener: async (listener) => {
      const connectionHandle = await DeviceConnection.addListener('sessionClosed', (event) => {
        if (event.sessionId) {
          outboundSessionMetaById.delete(event.sessionId)
        }
        listener(event)
      })
      const discoveryHandle = await LanDiscovery.addListener('sessionClosed', (event) => {
        if (event.sessionId) {
          lanDiscoveryTransportSessionIds.delete(event.sessionId)
          outboundSessionMetaById.delete(event.sessionId)
        }
        listener({
          sessionId: event.sessionId,
          reason: event.reason,
          transport: 'tcp'
        })
      })
      return combineListenerHandles(connectionHandle, discoveryHandle)
    },
    addMessageReceivedListener: async (listener) => {
      const connectionHandle = await DeviceConnection.addListener('messageReceived', listener)
      const discoveryHandle = await LanDiscovery.addListener('messageReceived', (event) => {
        listener({
          sessionId: event.sessionId,
          messageId: event.messageId,
          messageType: event.messageType,
          payload: event.payload,
          timestamp: event.timestamp,
          transport: 'tcp'
        })
      })
      return combineListenerHandles(connectionHandle, discoveryHandle)
    },
    addMessageAckListener: (listener) => DeviceConnection.addListener('messageAck', listener),
    addTransportErrorListener: async (listener) => {
      const connectionHandle = await DeviceConnection.addListener('transportError', listener)
      const discoveryHandle = await LanDiscovery.addListener('transportError', (event) => {
        listener({
          transport: 'tcp',
          code: typeof event.code === 'string' ? event.code : undefined,
          message:
            typeof event.message === 'string' && event.message.length > 0
              ? event.message
              : 'LanDiscovery transport error'
        })
      })
      return combineListenerHandles(connectionHandle, discoveryHandle)
    }
  }

  return adapter
}
