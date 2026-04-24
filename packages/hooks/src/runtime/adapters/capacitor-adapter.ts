import { DeviceConnection } from '@synra/capacitor-device-connection'
import { LanDiscovery } from '@synra/capacitor-lan-discovery'
import type { ConnectionRuntimeAdapter } from '../adapter'

export function createCapacitorRuntimeAdapter(): ConnectionRuntimeAdapter {
  const adapter: ConnectionRuntimeAdapter = {
    startDiscovery: (options) => LanDiscovery.startDiscovery(options),
    listDiscoveredDevices: () => LanDiscovery.getDiscoveredDevices(),
    probeSynraPeers: (options) => DeviceConnection.probeSynraPeers(options),
    openTransport: (options) => DeviceConnection.openTransport(options),
    closeTransport: async (deviceId) => {
      await DeviceConnection.closeTransport({ targetDeviceId: deviceId })
    },
    sendMessage: async (options) => {
      await DeviceConnection.sendMessage(options)
    },
    sendLanEvent: async (options) => {
      await DeviceConnection.sendLanEvent(options)
    },
    getTransportState: async (deviceId) =>
      DeviceConnection.getTransportState({ targetDeviceId: deviceId }),
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
    addTransportOpenedListener: async (listener) =>
      DeviceConnection.addListener('transportOpened', (event) => {
        const normalizedDirection: 'inbound' | 'outbound' =
          event.direction === 'inbound' ? 'inbound' : 'outbound'
        if (normalizedDirection === 'inbound' && (!event.deviceId || event.deviceId.length === 0)) {
          return
        }
        listener({
          ...event,
          deviceId: event.deviceId,
          direction: normalizedDirection,
          transport: event.transport ?? 'tcp',
          host: typeof event.host === 'string' && event.host.length > 0 ? event.host : undefined,
          port: typeof event.port === 'number' ? event.port : undefined,
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
    addTransportClosedListener: async (listener) =>
      DeviceConnection.addListener('transportClosed', listener),
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
