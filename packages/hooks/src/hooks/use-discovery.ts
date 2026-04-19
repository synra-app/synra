import type { SynraDiscoveryStartOptions } from '../types'
import { getConnectionRuntime } from '../runtime/core'

export function useDiscovery() {
  const runtime = getConnectionRuntime()

  return {
    scanState: runtime.scanState,
    startedAt: runtime.startedAt,
    scanWindowMs: runtime.scanWindowMs,
    loading: runtime.loading,
    error: runtime.error,
    ensureListeners: () => runtime.ensureListeners(),
    startDiscovery: (options?: string[] | SynraDiscoveryStartOptions) =>
      runtime.startDiscovery(options),
    stopDiscovery: () => runtime.stopDiscovery(),
    refreshDevices: () => runtime.refreshDevices(),
    probeConnectable: (port?: number, timeoutMs?: number) =>
      runtime.probeConnectable(port, timeoutMs)
  }
}
