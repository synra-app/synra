import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import { unknownToErrorMessage } from '@synra/protocol'
import type { Ref } from 'vue'
import type { SynraDiscoveryStartOptions } from '../types'
import type { ConnectionRuntimeAdapter } from './adapter'
import { sortDevices } from './device-sort'

export function createDiscoveryModule(options: {
  adapter: ConnectionRuntimeAdapter
  scanState: Ref<string>
  startedAt: Ref<number | undefined>
  scanWindowMs: Ref<number>
  devices: Ref<DiscoveredDevice[]>
  loading: Ref<boolean>
  error: Ref<string | null>
}): {
  refreshDevices(): Promise<void>
  startDiscovery(options?: string[] | SynraDiscoveryStartOptions): Promise<void>
  stopDiscovery(): Promise<void>
  probeConnectable(port?: number, timeoutMs?: number): Promise<void>
} {
  const { adapter, scanState, startedAt, scanWindowMs, devices, loading, error } = options

  async function refreshDevices(): Promise<void> {
    try {
      const result = await adapter.getDiscoveredDevices()
      scanState.value = result.state
      startedAt.value = result.startedAt
      scanWindowMs.value = result.scanWindowMs
      devices.value = sortDevices(result.devices)
      error.value = null
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, 'Failed to load devices.')
      return
    }

    try {
      const probeResult = await adapter.probeConnectable(32100, 1500)
      devices.value = sortDevices(probeResult.devices)
      error.value = null
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, 'Failed to probe device connectability.')
    }
  }

  async function probeConnectable(port = 32100, timeoutMs = 1500): Promise<void> {
    try {
      const result = await adapter.probeConnectable(port, timeoutMs)
      devices.value = sortDevices(result.devices)
      error.value = null
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, 'Failed to probe device connectability.')
    }
  }

  async function startDiscovery(
    discoveryOptions: string[] | SynraDiscoveryStartOptions = []
  ): Promise<void> {
    loading.value = true
    try {
      const normalizedOptions: SynraDiscoveryStartOptions = Array.isArray(discoveryOptions)
        ? {
            manualTargets: discoveryOptions
          }
        : discoveryOptions
      const result = await adapter.startDiscovery({
        discoveryMode: 'hybrid',
        includeLoopback: false,
        enableProbeFallback: true,
        ...normalizedOptions
      })
      scanState.value = result.state
      startedAt.value = result.startedAt
      scanWindowMs.value = result.scanWindowMs
      devices.value = sortDevices(result.devices)
      error.value = null
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, 'Failed to start discovery.')
    } finally {
      loading.value = false
    }
  }

  async function stopDiscovery(): Promise<void> {
    loading.value = true
    try {
      await adapter.stopDiscovery()
      scanState.value = 'idle'
      error.value = null
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, 'Failed to stop discovery.')
    } finally {
      loading.value = false
    }
  }

  return {
    refreshDevices,
    startDiscovery,
    stopDiscovery,
    probeConnectable
  }
}
