import type { DiscoveryState, DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import { unknownToErrorMessage } from '@synra/protocol'
import type { Ref } from 'vue'
import type { SynraDiscoveryStartOptions } from '../types'
import type { ConnectionRuntimeAdapter } from './adapter'
import { sortDevices } from './device-sort'

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
      devices.value = sortDevices(result.devices)
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
