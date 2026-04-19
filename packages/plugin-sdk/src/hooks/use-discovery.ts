import { useSynraHooksAdapter } from './context'

export function useDiscovery() {
  const adapter = useSynraHooksAdapter()

  return {
    scanState: adapter.scanState,
    startedAt: adapter.startedAt,
    scanWindowMs: adapter.scanWindowMs,
    loading: adapter.loading,
    error: adapter.error,
    ensureListeners: () => adapter.ensureListeners(),
    startDiscovery: (manualTargets?: string[]) => adapter.startDiscovery(manualTargets),
    stopDiscovery: () => adapter.stopDiscovery(),
    refreshDevices: () => adapter.refreshDevices(),
    probeConnectable: (port?: number, timeoutMs?: number) =>
      adapter.probeConnectable(port, timeoutMs)
  }
}
