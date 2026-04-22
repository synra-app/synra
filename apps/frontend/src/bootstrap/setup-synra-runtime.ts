import type { Pinia } from 'pinia'
import { Capacitor } from '@capacitor/core'
import { installElectronCapacitor } from '@synra/capacitor-electron/capacitor'
import { ensureDeviceInstanceUuid } from '../lib/device-instance-uuid'
import { useLanDiscoveryStore } from '../stores/lan-discovery'

/** Cold start: retry once if no connectable Synra peer (TCP helloAck succeeded on native). */
function initialDiscoveryLooksIncomplete(peers: ReadonlyArray<{ connectable?: boolean }>): boolean {
  if (peers.length === 0) {
    return true
  }
  return !peers.some((peer) => peer.connectable)
}

export function setupSynraRuntime(pinia: Pinia): void {
  installElectronCapacitor({ capacitor: Capacitor })

  const lanDiscoveryStore = useLanDiscoveryStore(pinia)
  const INITIAL_SCAN_RETRY_DELAY_MS = 2500
  const INITIAL_SCAN_MAX_ATTEMPTS = 2
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  const ensureRuntimeListeners = async (): Promise<void> => {
    await lanDiscoveryStore.ensureReady().catch((error: unknown) => {
      console.warn('[SynraConnection] failed to register global listeners:', error)
    })
  }

  /** Matches connect page: `ensureReady` then `startScan` only — no extra native reads. */
  const startInitialDiscovery = async (): Promise<void> => {
    for (let attempt = 1; attempt <= INITIAL_SCAN_MAX_ATTEMPTS; attempt += 1) {
      try {
        await lanDiscoveryStore.startScan()
        if (!initialDiscoveryLooksIncomplete(lanDiscoveryStore.peers)) {
          return
        }
      } catch (error: unknown) {
        console.warn(`[SynraLanDiscovery] initial auto scan attempt ${attempt} failed:`, error)
      }

      if (attempt < INITIAL_SCAN_MAX_ATTEMPTS) {
        await wait(INITIAL_SCAN_RETRY_DELAY_MS)
      }
    }
  }

  void ensureDeviceInstanceUuid()
    .then(async () => {
      await ensureRuntimeListeners()
      await startInitialDiscovery()
    })
    .catch((error: unknown) => {
      console.warn('[SynraPreferences] ensureDeviceInstanceUuid failed:', error)
      void (async () => {
        await ensureRuntimeListeners()
        await startInitialDiscovery()
      })()
    })
}
