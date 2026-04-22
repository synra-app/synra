import type { Pinia } from 'pinia'
import { Capacitor } from '@capacitor/core'
import { configureHooksRuntime } from '@synra/hooks'
import { installElectronCapacitor } from '@synra/capacitor-electron/capacitor'
import { ensureDeviceInstanceUuid } from '../lib/device-instance-uuid'
import { hashDeviceIdFromInstanceUuid } from '../lib/hash-device-id'
import { ensureDeviceBasicInfo } from '../lib/device-basic-info'
import { syncPairedDiscoveryExclusionFromRecords } from '../lib/discovery-paired-exclusion'
import {
  listPairedDeviceRecords,
  patchPairedDeviceDisplayName,
  repairPairedDevicesPersistenceIfNeeded
} from '../lib/paired-devices-storage'
import { registerPairedAutoConnect } from '../composables/use-paired-auto-connect'
import { applyHandshakePairedSync } from '../lib/apply-handshake-paired-sync'
import { registerPairingProtocol } from './register-pairing-protocol'
import { useLanDiscoveryStore } from '../stores/lan-discovery'
import { usePairingStore } from '../stores/pairing'

/** Cold start: retry once if no connectable Synra peer (TCP helloAck succeeded on native). */
function initialDiscoveryLooksIncomplete(peers: ReadonlyArray<{ connectable?: boolean }>): boolean {
  if (peers.length === 0) {
    return true
  }
  return !peers.some((peer) => peer.connectable)
}

export function setupSynraRuntime(pinia: Pinia): void {
  installElectronCapacitor({ capacitor: Capacitor })

  void repairPairedDevicesPersistenceIfNeeded()
    .then(async () => {
      const records = await listPairedDeviceRecords()
      syncPairedDiscoveryExclusionFromRecords(records)
    })
    .catch(() => undefined)

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
    .then(async (deviceInstanceUuid) => {
      try {
        await ensureDeviceBasicInfo(deviceInstanceUuid)
      } catch (error: unknown) {
        console.warn('[SynraPreferences] ensureDeviceBasicInfo failed:', error)
      }
      const localDiscoveryDeviceId = await hashDeviceIdFromInstanceUuid(deviceInstanceUuid)
      configureHooksRuntime({
        localDiscoveryDeviceId,
        onHandshakePairedPeerIds: (peerDeviceId, theirPairedPeerDeviceIds, meta) => {
          void applyHandshakePairedSync({
            pinia,
            peerDeviceId,
            theirPairedPeerDeviceIds,
            openedSessionId: meta?.sessionId
          })
        },
        onRemoteDeviceProfile: (deviceId, displayName) => {
          void patchPairedDeviceDisplayName(deviceId, displayName).then((ok) => {
            if (ok) {
              usePairingStore(pinia).bumpPairedList()
            }
          })
        }
      })
      await ensureRuntimeListeners()
      await registerPairingProtocol(pinia)
      registerPairedAutoConnect(pinia)
      await startInitialDiscovery()
    })
    .catch((error: unknown) => {
      console.warn('[SynraPreferences] ensureDeviceInstanceUuid failed:', error)
      void (async () => {
        await ensureRuntimeListeners()
        await registerPairingProtocol(pinia)
        registerPairedAutoConnect(pinia)
        await startInitialDiscovery()
      })()
    })
}
