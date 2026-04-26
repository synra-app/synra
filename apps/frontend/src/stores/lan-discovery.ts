import { useLogger, useTransport } from '@synra/hooks'
import { defineStore } from 'pinia'

export const useLanDiscoveryStore = defineStore('lan-discovery', () => {
  const transport = useTransport()
  const { tcpLogger } = useLogger()

  const sendLanEvent: typeof transport.sendLanEvent = async (input) => {
    tcpLogger.info('send', input)
    return transport.sendLanEvent(input)
  }

  return {
    peers: transport.peers,
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
    sendLanEvent,
    onSynraMessage: transport.onSynraMessage
  }
})
