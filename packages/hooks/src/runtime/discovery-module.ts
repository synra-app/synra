import type { DiscoveryState, DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import { unknownToErrorMessage } from '@synra/protocol'
import type { Ref } from 'vue'
import type { SynraDiscoveryStartOptions } from '../types'
import type { ConnectionRuntimeAdapter } from './adapter'
import { sortDevices } from './device-sort'

const SILENT_PROBE_DEFAULT_PORT = 32100

async function silentlyVerifyDevice(
  adapter: ConnectionRuntimeAdapter,
  device: DiscoveredDevice
): Promise<boolean> {
  if (!device.ipAddress) {
    return false
  }
  try {
    const opened = await adapter.openSession({
      deviceId: device.deviceId,
      host: device.ipAddress,
      port: device.port ?? SILENT_PROBE_DEFAULT_PORT
    })
    await adapter.closeSession(opened.sessionId).catch(() => undefined)
    return true
  } catch {
    return false
  }
}

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
    const snapshotBeforeScan = devices.value
    try {
      const result = await adapter.startDiscovery({
        discoveryMode: 'hybrid',
        includeLoopback: false,
        enableProbeFallback: true,
        ...discoveryOptions
      })
      scanState.value = result.state

      if (result.devices.length > 0) {
        devices.value = sortDevices(result.devices)
        error.value = null
        return
      }

      if (snapshotBeforeScan.length === 0) {
        devices.value = []
        error.value = null
        return
      }

      const keepFlags = await Promise.all(
        snapshotBeforeScan.map((device) => silentlyVerifyDevice(adapter, device))
      )
      devices.value = sortDevices(snapshotBeforeScan.filter((_device, index) => keepFlags[index]))
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
