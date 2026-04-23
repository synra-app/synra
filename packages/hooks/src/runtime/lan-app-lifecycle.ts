import type { DiscoveredDevice, DiscoveryState } from '@synra/capacitor-lan-discovery'
import type { Ref } from 'vue'
import type { RuntimeConnectedSession } from '../types'
import type { ConnectionRuntimeAdapter } from './adapter'
import { getHooksRuntimeOptions, isLocalDiscoveryDeviceId } from './config'
import { filterExposedDiscoveredDevices } from './discovery-exposure'
import { sortDevices } from './device-sort'
import { normalizeHost } from './host-normalization'
import { pruneStalePairAwaitingForOpenSessions } from './pair-awaiting-prune'

export type LanAppLifecycleHandle = {
  remove: () => Promise<void>
}

/**
 * When the app returns to foreground, refresh the device list from native state so pairing /
 * transport hints stay aligned without requiring a second manual scan.
 */
export async function registerLanTransportAppLifecycle(options: {
  adapter: ConnectionRuntimeAdapter
  scanState: Ref<DiscoveryState>
  devices: Ref<DiscoveredDevice[]>
  connectedSessions: Ref<RuntimeConnectedSession[]>
}): Promise<LanAppLifecycleHandle> {
  const { App } = await import('@capacitor/app')
  const handle = await App.addListener('appStateChange', async ({ isActive }) => {
    if (!isActive) {
      return
    }
    const list = await options.adapter.listDiscoveredDevices()
    options.scanState.value = list.state
    const exclude = getHooksRuntimeOptions().shouldExcludeDiscoveredDevice
    const shouldDrop = (deviceId: string) =>
      isLocalDiscoveryDeviceId(deviceId) || (typeof exclude === 'function' && exclude(deviceId))
    const rows = filterExposedDiscoveredDevices(
      list.devices
        .filter((d) => !shouldDrop(d.deviceId))
        .map((d) => ({
          ...d,
          ipAddress: normalizeHost(d.ipAddress)
        }))
    )
    options.devices.value = sortDevices(rows)
    pruneStalePairAwaitingForOpenSessions(options.devices, options.connectedSessions)
  })
  return {
    remove: () => handle.remove()
  }
}
