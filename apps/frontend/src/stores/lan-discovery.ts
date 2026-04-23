import { useTransport } from '@synra/hooks'
import { defineStore } from 'pinia'

export const useLanDiscoveryStore = defineStore('lan-discovery', () => {
  const transport = useTransport()

  return {
    peers: transport.peers,
    transportReadyDeviceIds: transport.transportReadyDeviceIds,
    appReadyDeviceIds: transport.appReadyDeviceIds,
    connectedSessions: transport.connectedSessions,
    scanState: transport.scanState,
    loading: transport.loading,
    error: transport.error,
    ensureReady: transport.ensureReady,
    startScan: transport.startScan,
    connectToDevice: transport.connectToDevice,
    connectToDeviceAt: transport.connectToDeviceAt,
    broadcastDeviceProfileToOpenSessions: transport.broadcastDeviceProfileToOpenSessions,
    disconnectDevice: transport.disconnectDevice,
    sendConnectionMessage: transport.sendConnectionMessage,
    sendLanEvent: transport.sendLanEvent,
    onSynraMessage: transport.onSynraMessage
  }
})
