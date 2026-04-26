import type { Pinia } from 'pinia'
import type { ShallowRef } from 'vue'
import { Capacitor } from '@capacitor/core'
import { initSynraRuntimePlatform } from '@synra/transport-events'
import { configureHooksRuntime } from '@synra/hooks'
import { installElectronCapacitor } from '@synra/capacitor-electron/capacitor'
import { ensureDeviceInstanceUuid } from '../lib/device-instance-uuid'
import { ensureDeviceBasicInfo } from '../lib/device-basic-info'
import { isPairedDeviceExcludedFromDiscovery } from '../lib/discovery-paired-exclusion'
import {
  patchPairedDeviceDisplayName,
  removePairedDeviceRecord,
  repairPairedDevicesPersistenceIfNeeded
} from '../lib/paired-devices-storage'
import { registerPairedAutoConnect } from '../composables/use-paired-auto-connect'
import { registerPairingProtocol } from './register-pairing-protocol'
import type { PairingProtocolContext } from '../composables/use-pairing-protocol-context'
import { useLanDiscoveryStore } from '../stores/lan-discovery'
import { usePairingStore } from '../stores/pairing'

/** Cold start: retry once if no connectable Synra peer (TCP connectAck succeeded on native). */
function initialDiscoveryLooksIncomplete(peers: ReadonlyArray<{ connectable?: boolean }>): boolean {
  if (peers.length === 0) {
    return true
  }
  return !peers.some((peer) => peer.connectable)
}

export function setupSynraRuntime(
  pinia: Pinia,
  pairingProtocolHolder: ShallowRef<PairingProtocolContext | null>
): void {
  installElectronCapacitor({ capacitor: Capacitor })
  initSynraRuntimePlatform()

  const pairingStore = usePairingStore(pinia)
  const ensurePairedRecordsReady = async (): Promise<void> => {
    await repairPairedDevicesPersistenceIfNeeded().catch(() => undefined)
    // SYNRA-COMM::PLUGIN_BRIDGE::CONNECT::LOAD_PAIRED_RECORDS
    await pairingStore.refreshPairedRecords()
  }

  const lanDiscoveryStore = useLanDiscoveryStore(pinia)
  const INITIAL_SCAN_RETRY_DELAY_MS = 2500
  const INITIAL_SCAN_MAX_ATTEMPTS = 2
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  const ensureRuntimeListeners = async (): Promise<void> => {
    await lanDiscoveryStore.ensureReady().catch(() => undefined)
  }
  let runtimeInitialized = false
  const initializeRuntime = async (): Promise<void> => {
    if (runtimeInitialized) {
      return
    }
    runtimeInitialized = true
    await ensureRuntimeListeners()
    await registerPairingProtocol(pinia, pairingProtocolHolder)
    registerPairedAutoConnect(pinia)
  }

  /** Matches connect page: `ensureReady` then `startScan` only — no extra native reads. */
  const startInitialDiscovery = async (): Promise<void> => {
    for (let attempt = 1; attempt <= INITIAL_SCAN_MAX_ATTEMPTS; attempt += 1) {
      try {
        await lanDiscoveryStore.startScan()
        if (!initialDiscoveryLooksIncomplete(lanDiscoveryStore.peers)) {
          return
        }
      } catch {}

      if (attempt < INITIAL_SCAN_MAX_ATTEMPTS) {
        await wait(INITIAL_SCAN_RETRY_DELAY_MS)
      }
    }
  }

  void initializeRuntime()
    .catch(() => undefined)
    .then(() => Promise.all([ensureDeviceInstanceUuid(), ensurePairedRecordsReady()]))
    .then(async ([deviceInstanceUuid]) => {
      try {
        await ensureDeviceBasicInfo(deviceInstanceUuid)
      } catch {}
      const localDiscoveryDeviceId = deviceInstanceUuid
      const downgradePairedToFresh = async (deviceId: string): Promise<void> => {
        if (deviceId.trim().length === 0) {
          return
        }
        if (!(await pairingStore.hasPairedDeviceStrict(deviceId))) {
          return
        }
        await removePairedDeviceRecord(deviceId)
        pairingStore.bumpPairedList()
      }
      configureHooksRuntime({
        shouldExcludeDiscoveredDevice: (deviceId) => isPairedDeviceExcludedFromDiscovery(deviceId),
        localDiscoveryDeviceId,
        onRemoteDeviceProfile: (deviceId, displayName) => {
          void patchPairedDeviceDisplayName(deviceId, displayName).then((ok) => {
            if (ok) {
              pairingStore.bumpPairedList()
            }
          })
        },
        resolveSynraConnectType: async (deviceId) => {
          return (await pairingStore.hasPairedDeviceStrict(deviceId)) ? 'paired' : 'fresh'
        },
        repairStalePairingAfterInboundFreshConnect: async (event) => {
          const wire = event.incomingSynraConnectPayload
          const ct =
            wire && typeof wire.connectType === 'string'
              ? wire.connectType.trim().toLowerCase()
              : ''
          if (ct !== 'fresh' || !event.deviceId) {
            return
          }
          await downgradePairedToFresh(event.deviceId)
        },
        repairStalePairingAfterOutboundUnpairedAck: async (event) => {
          const wire = event.connectAckPayload
          const ct =
            wire && typeof wire.connectType === 'string'
              ? wire.connectType.trim().toLowerCase()
              : ''
          const unpairedHint = wire?.hostListsPeerAsPaired === false
          if ((ct !== 'fresh' && !unpairedHint) || !event.deviceId) {
            return
          }
          await downgradePairedToFresh(event.deviceId)
        }
      })
      await initializeRuntime()
      await startInitialDiscovery()
    })
    .catch(() => {
      void (async () => {
        await initializeRuntime()
        await startInitialDiscovery()
      })()
    })
}
