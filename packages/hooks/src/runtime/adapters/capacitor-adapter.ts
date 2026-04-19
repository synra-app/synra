import { DeviceConnection } from '@synra/capacitor-device-connection'
import { LanDiscovery } from '@synra/capacitor-lan-discovery'
import type { ConnectionRuntimeAdapter } from '../adapter'

export function createCapacitorRuntimeAdapter(): ConnectionRuntimeAdapter {
  return {
    getDiscoveredDevices: () => LanDiscovery.getDiscoveredDevices(),
    startDiscovery: (options) => LanDiscovery.startDiscovery(options),
    stopDiscovery: async () => {
      await LanDiscovery.stopDiscovery()
    },
    pairDevice: (deviceId) => LanDiscovery.pairDevice({ deviceId }),
    probeConnectable: (port, timeoutMs) => LanDiscovery.probeConnectable({ port, timeoutMs }),
    openSession: (options) => DeviceConnection.openSession(options),
    closeSession: async (sessionId) => {
      await DeviceConnection.closeSession({ sessionId })
    },
    sendMessage: async (options) => {
      await DeviceConnection.sendMessage(options)
    },
    getSessionState: (sessionId) => DeviceConnection.getSessionState({ sessionId }),
    pullHostEvents: () => DeviceConnection.pullHostEvents(),
    addDeviceConnectableUpdatedListener: (listener) =>
      LanDiscovery.addListener('deviceConnectableUpdated', listener),
    addSessionOpenedListener: (listener) => DeviceConnection.addListener('sessionOpened', listener),
    addSessionClosedListener: (listener) => DeviceConnection.addListener('sessionClosed', listener),
    addMessageReceivedListener: (listener) =>
      DeviceConnection.addListener('messageReceived', listener),
    addMessageAckListener: (listener) => DeviceConnection.addListener('messageAck', listener),
    addTransportErrorListener: (listener) =>
      DeviceConnection.addListener('transportError', listener)
  }
}
