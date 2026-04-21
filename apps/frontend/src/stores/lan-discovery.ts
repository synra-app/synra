import { useTransport } from '@synra/hooks'
import { defineStore } from 'pinia'

export const useLanDiscoveryStore = defineStore('lan-discovery', () => {
  const transport = useTransport()

  return {
    peers: transport.peers,
    connectedDeviceIds: transport.connectedDeviceIds,
    scanState: transport.scanState,
    loading: transport.loading,
    error: transport.error,
    ensureReady: transport.ensureReady,
    startScan: transport.startScan,
    connectToDevice: transport.connectToDevice,
    disconnectDevice: transport.disconnectDevice
  }
})
