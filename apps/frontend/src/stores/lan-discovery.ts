import { onSynraMessage, useTransport } from '@synra/hooks'
import { defineStore } from 'pinia'

export const useLanDiscoveryStore = defineStore('lan-discovery', () => {
  const transport = useTransport()

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
    disconnectDevice: transport.disconnectDevice,
    /** Prefer `useSynraPluginEnvelope` / `useSynraEnvelope().subscribe`. Exposed for legacy plugin bundles. */
    onSynraMessage
  }
})
