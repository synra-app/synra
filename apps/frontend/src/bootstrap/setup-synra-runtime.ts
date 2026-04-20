import type { Pinia } from 'pinia'
import { Capacitor } from '@capacitor/core'
import { LanDiscovery } from '@synra/capacitor-lan-discovery'
import { installElectronCapacitor } from '@synra/capacitor-electron/capacitor'
import { useLanDiscoveryStore } from '../stores/lan-discovery'

export function setupSynraRuntime(pinia: Pinia): void {
  installElectronCapacitor({ capacitor: Capacitor })

  const platform = Capacitor.getPlatform()
  if (platform === 'android' || platform === 'ios') {
    // Warm up native LAN discovery plugin at startup so mobile can be discovered by peers.
    void LanDiscovery.getDiscoveredDevices()
      .then(() => {
        console.info('[SynraLanDiscovery] warm-up success on mobile platform:', platform)
      })
      .catch((error: unknown) => {
        console.warn('[SynraLanDiscovery] warm-up failed on mobile platform:', platform, error)
      })
  }

  const lanDiscoveryStore = useLanDiscoveryStore(pinia)
  void lanDiscoveryStore.ensureListeners().catch((error: unknown) => {
    console.warn('[SynraConnection] failed to register global listeners:', error)
  })
}
