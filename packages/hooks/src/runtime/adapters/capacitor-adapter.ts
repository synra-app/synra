import { DeviceConnection } from '@synra/capacitor-device-connection'
import { LanDiscovery } from '@synra/capacitor-lan-discovery'
import type { ConnectionRuntimeAdapter } from '../adapter'

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

export function createCapacitorRuntimeAdapter(): ConnectionRuntimeAdapter {
  const PREFERRED_PC_TCP_PORT = 32100
  const inboundSessionIds = new Set<string>()
  const reverseConnectInFlight = new Set<string>()
  const outboundSessionMetaById = new Map<
    string,
    {
      deviceId: string
      host: string
      port: number
      transport: 'tcp'
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

  return {
    getDiscoveredDevices: () => LanDiscovery.getDiscoveredDevices(),
    startDiscovery: (options) => LanDiscovery.startDiscovery(options),
    stopDiscovery: async () => {
      await LanDiscovery.stopDiscovery()
    },
    probeConnectable: (port, timeoutMs) => LanDiscovery.probeConnectable({ port, timeoutMs }),
    openSession: async (options) => {
      const result = await DeviceConnection.openSession(options)
      outboundSessionMetaById.set(result.sessionId, {
        deviceId: options.deviceId,
        host: options.host,
        port: options.port,
        transport: 'tcp'
      })
      return result
    },
    closeSession: async (sessionId) => {
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
    pullHostEvents: () => DeviceConnection.pullHostEvents(),
    addDeviceConnectableUpdatedListener: (listener) =>
      LanDiscovery.addListener('deviceConnectableUpdated', listener),
    addSessionOpenedListener: async (listener) => {
      const connectionHandle = await DeviceConnection.addListener('sessionOpened', (event) => {
        const meta = event.sessionId ? outboundSessionMetaById.get(event.sessionId) : undefined
        const normalizedDirection: 'inbound' | 'outbound' =
          event.direction === 'inbound' ? 'inbound' : 'outbound'
        const normalized = {
          ...event,
          deviceId:
            typeof event.deviceId === 'string' && event.deviceId.length > 0
              ? event.deviceId
              : meta?.deviceId,
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
          port: event.port
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
        const reverseConnectKey = `${reverseHost}:${reverseConnectPort}`
        if (reverseConnectInFlight.has(reverseConnectKey)) {
          return
        }
        reverseConnectInFlight.add(reverseConnectKey)
        void DeviceConnection.openSession({
          deviceId: reverseDeviceId,
          host: reverseHost,
          port: reverseConnectPort,
          transport: 'tcp'
        })
          .then(async (result) => {
            outboundSessionMetaById.set(result.sessionId, {
              deviceId: reverseDeviceId,
              host: reverseHost,
              port: reverseConnectPort,
              transport: 'tcp'
            })
            await LanDiscovery.closeSession({ sessionId: event.sessionId })
          })
          .catch(() => undefined)
          .finally(() => {
            reverseConnectInFlight.delete(reverseConnectKey)
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
          inboundSessionIds.delete(event.sessionId)
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
