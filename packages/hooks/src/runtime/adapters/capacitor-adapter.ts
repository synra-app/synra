import { DeviceConnection } from '@synra/capacitor-device-connection'
import { LanDiscovery } from '@synra/capacitor-lan-discovery'
import type { ConnectionRuntimeAdapter } from '../adapter'
import { HandoffCoordinator } from '../handoff-coordinator'
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

const PREFERRED_PC_TCP_PORT = 32100

export function createCapacitorRuntimeAdapter(): ConnectionRuntimeAdapter {
  const handoff = new HandoffCoordinator()
  const inboundSessionIds = new Set<string>()
  const outboundSessionMetaById = new Map<
    string,
    {
      deviceId: string
      host: string
      port: number
    }
  >()
  const pendingOutboundMetaByRemote = new Map<
    string,
    {
      deviceId: string
      host: string
      port: number
    }
  >()

  const runtimePlatform = (
    globalThis as {
      Capacitor?: {
        getPlatform?: () => string
      }
    }
  ).Capacitor?.getPlatform?.()
  const shouldPreferPcHost = runtimePlatform === 'android' || runtimePlatform === 'ios'

  function resolveHostKeyForSession(sessionId: string): string | undefined {
    const meta = outboundSessionMetaById.get(sessionId)
    if (meta) {
      return normalizeHostKey(meta.host, meta.port)
    }
    return undefined
  }

  return {
    startDiscovery: (options) => LanDiscovery.startDiscovery(options),
    openSession: async (options) => {
      const pendingMeta = {
        deviceId: options.deviceId,
        host: options.host,
        port: options.port
      }
      const pendingKey = normalizeHostKey(options.host, options.port)
      pendingOutboundMetaByRemote.set(pendingKey, pendingMeta)
      const result = await DeviceConnection.openSession(options)
      outboundSessionMetaById.set(result.sessionId, pendingMeta)
      return result
    },
    invalidateHandoffForHostKeys(keys: readonly string[]): void {
      handoff.invalidateHostKeys(keys)
    },
    closeSession: async (sessionId) => {
      handoff.bumpForClosingSession(sessionId, resolveHostKeyForSession)
      const closeTasks: Array<Promise<unknown>> = [DeviceConnection.closeSession({ sessionId })]
      if (sessionId) {
        outboundSessionMetaById.delete(sessionId)
      }
      if (sessionId && inboundSessionIds.has(sessionId)) {
        closeTasks.push(LanDiscovery.closeSession({ sessionId }))
      }
      await Promise.all(closeTasks)
    },
    sendMessage: async (options) => {
      if (inboundSessionIds.has(options.sessionId)) {
        await LanDiscovery.sendMessage(options)
        return
      }
      try {
        await DeviceConnection.sendMessage(options)
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : JSON.stringify(error)
        if (message.includes('Session is not open')) {
          await LanDiscovery.sendMessage(options)
          return
        }
        throw error
      }
    },
    getSessionState: (sessionId) => DeviceConnection.getSessionState({ sessionId }),
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
          outboundSessionMetaById.set(event.sessionId, meta)
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
          port: typeof event.port === 'number' ? event.port : meta?.port
        }
        listener({
          ...normalized
        })
      })
      const discoveryHandle = await LanDiscovery.addListener('sessionOpened', (event) => {
        if (!event.deviceId) {
          return
        }
        inboundSessionIds.add(event.sessionId)
        listener({
          sessionId: event.sessionId,
          deviceId: event.deviceId,
          direction: 'inbound',
          transport: 'tcp',
          host: event.host,
          port: event.port,
          displayName:
            typeof event.displayName === 'string' && event.displayName.length > 0
              ? event.displayName
              : undefined
        })
        if (!shouldPreferPcHost || !event.host) {
          return
        }
        const reverseHost = event.host
        const reverseDeviceId = event.deviceId
        const reverseConnectPort =
          typeof event.port === 'number' && event.port > 0
            ? event.port === PREFERRED_PC_TCP_PORT
              ? event.port
              : PREFERRED_PC_TCP_PORT
            : PREFERRED_PC_TCP_PORT
        const hostKey = normalizeHostKey(reverseHost, reverseConnectPort)
        const ticket = handoff.beginHandoffTicket(hostKey)
        handoff.registerInboundLanSession(event.sessionId, hostKey)

        const pendingMeta = {
          deviceId: reverseDeviceId,
          host: reverseHost,
          port: reverseConnectPort
        }
        const pendingKey = normalizeHostKey(reverseHost, reverseConnectPort)
        pendingOutboundMetaByRemote.set(pendingKey, pendingMeta)

        void (async () => {
          try {
            const result = await DeviceConnection.openSession({
              deviceId: reverseDeviceId,
              host: reverseHost,
              port: reverseConnectPort,
              transport: 'tcp'
            })
            if (handoff.isTicketStale(hostKey, ticket)) {
              return
            }
            outboundSessionMetaById.set(result.sessionId, pendingMeta)
            pendingOutboundMetaByRemote.delete(pendingKey)
            await LanDiscovery.closeSession({ sessionId: event.sessionId })
            inboundSessionIds.delete(event.sessionId)
            handoff.clearInboundLanSession(event.sessionId)
          } catch {
            if (!handoff.isTicketStale(hostKey, ticket)) {
              // Stale failures are expected when user disconnects during handoff.
            }
          }
        })()
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
          inboundSessionIds.delete(event.sessionId)
          handoff.clearInboundLanSession(event.sessionId)
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
    addTransportErrorListener: (listener) =>
      DeviceConnection.addListener('transportError', listener)
  }
}
