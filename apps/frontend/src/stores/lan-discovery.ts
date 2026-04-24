import { useTransport } from '@synra/hooks'
import { defineStore } from 'pinia'

export const useLanDiscoveryStore = defineStore('lan-discovery', () => {
  const transport = useTransport()

  return {
    peers: transport.peers,
    transportReadyDeviceIds: transport.transportReadyDeviceIds,
    appReadyDeviceIds: transport.appReadyDeviceIds,
    openTransportLinks: transport.openTransportLinks,
    scanState: transport.scanState,
    loading: transport.loading,
    error: transport.error,
    ensureReady: transport.ensureReady,
    startScan: transport.startScan,
    connectToDevice: transport.connectToDevice,
    connectToDeviceAt: transport.connectToDeviceAt,
    broadcastDeviceProfileToOpenTransportLinks:
      transport.broadcastDeviceProfileToOpenTransportLinks,
    disconnectDevice: transport.disconnectDevice,
    sendConnectionMessage: transport.sendConnectionMessage,
    sendLanEvent: transport.sendLanEvent,
    onSynraMessage: transport.onSynraMessage
  }
})
