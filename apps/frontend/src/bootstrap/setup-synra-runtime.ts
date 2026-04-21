import type { Pinia } from 'pinia'
import { Capacitor } from '@capacitor/core'
import { LanDiscovery } from '@synra/capacitor-lan-discovery'
import { installElectronCapacitor } from '@synra/capacitor-electron/capacitor'
import { ensureDeviceInstanceUuid } from '../lib/device-instance-uuid'
import { useLanDiscoveryStore } from '../stores/lan-discovery'

export function setupSynraRuntime(pinia: Pinia): void {
  installElectronCapacitor({ capacitor: Capacitor })

  const lanDiscoveryStore = useLanDiscoveryStore(pinia)

  void ensureDeviceInstanceUuid()
    .then(async () => {
      await lanDiscoveryStore.ensureListeners().catch((error: unknown) => {
        console.warn('[SynraConnection] failed to register global listeners:', error)
      })
      const platform = Capacitor.getPlatform()
      if (platform === 'android' || platform === 'ios') {
        void LanDiscovery.getDiscoveredDevices()
          .then(() => {
            console.info('[SynraLanDiscovery] warm-up success on mobile platform:', platform)
          })
          .catch((error: unknown) => {
            console.warn('[SynraLanDiscovery] warm-up failed on mobile platform:', platform, error)
          })
      }
    })
    .catch((error: unknown) => {
      console.warn('[SynraPreferences] ensureDeviceInstanceUuid failed:', error)
      void lanDiscoveryStore.ensureListeners().catch((listenerError: unknown) => {
        console.warn('[SynraConnection] failed to register global listeners:', listenerError)
      })
    })
}
