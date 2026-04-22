import type { DiscoveryState, DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import { unknownToErrorMessage } from '@synra/protocol'
import type { Ref } from 'vue'
import type { SynraDiscoveryStartOptions } from '../types'
import type { ConnectionRuntimeAdapter } from './adapter'
import { getHooksRuntimeOptions, isLocalDiscoveryDeviceId } from './config'
import { sortDevices } from './device-sort'
import { normalizeHost } from './host-normalization'

export function createDiscoveryModule(options: {
  adapter: ConnectionRuntimeAdapter
  scanState: Ref<DiscoveryState>
  devices: Ref<DiscoveredDevice[]>
  loading: Ref<boolean>
  error: Ref<string | null>
}): {
  startDiscovery(options?: SynraDiscoveryStartOptions): Promise<void>
} {
  const { adapter, scanState, devices, loading, error } = options

  function mergeScanWithSessionPeers(
    scanDevices: DiscoveredDevice[],
    previous: DiscoveredDevice[],
    excludeDeviceId: (deviceId: string) => boolean
  ): DiscoveredDevice[] {
    const mergedById = new Map<string, DiscoveredDevice>()
    for (const device of scanDevices) {
      mergedById.set(device.deviceId, device)
    }
    const scanHosts = new Set(
      scanDevices.map((device) => normalizeHost(device.ipAddress)).filter((host) => host.length > 0)
    )
    for (const prev of previous) {
      if (prev.source !== 'session') {
        continue
      }
      if (excludeDeviceId(prev.deviceId)) {
        continue
      }
      if (mergedById.has(prev.deviceId)) {
        continue
      }
      const prevHost = normalizeHost(prev.ipAddress)
      if (prevHost.length > 0 && scanHosts.has(prevHost)) {
        continue
      }
      mergedById.set(prev.deviceId, prev)
    }
    return sortDevices([...mergedById.values()])
  }

  async function startDiscovery(discoveryOptions: SynraDiscoveryStartOptions = {}): Promise<void> {
    loading.value = true
    try {
      const result = await adapter.startDiscovery({
        discoveryMode: 'hybrid',
        includeLoopback: false,
        enableProbeFallback: true,
        ...discoveryOptions
      })
      scanState.value = result.state
      const exclude = getHooksRuntimeOptions().shouldExcludeDiscoveredDevice
      const shouldDrop = (deviceId: string) =>
        isLocalDiscoveryDeviceId(deviceId) || (typeof exclude === 'function' && exclude(deviceId))
      const filtered = result.devices.filter((device) => !shouldDrop(device.deviceId))
      devices.value = mergeScanWithSessionPeers(filtered, devices.value, shouldDrop)
      error.value = null
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, 'Failed to start discovery.')
    } finally {
      loading.value = false
    }
  }

  return {
    startDiscovery
  }
}
