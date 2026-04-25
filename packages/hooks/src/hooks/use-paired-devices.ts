import {
  SYNRA_PAIRED_DEVICES_KEY,
  SynraPreferences,
  parsePairedDevicesPayload,
  type SynraPairedDeviceRecord
} from '@synra/capacitor-preferences'
import { computed, onMounted, ref, watch } from 'vue'
import { getPairAwaitingAcceptDeviceIds } from '../runtime/pair-awaiting-accept'
import { pairedDevicesStorageEpoch } from '../runtime/paired-devices-storage-epoch'
import { getPairedLinkPhases } from '../runtime/paired-link-phases'
import { findReadyTransportLinkForDevice } from '../runtime/ready-transport-link'
import { useTransport } from './use-transport'

export type PairedLinkStatus = 'disconnected' | 'idle' | 'connecting' | 'connected'

export type PairedDeviceRow = {
  deviceId: string
  name: string
  ipAddress: string
  port?: number
  source?: string
  connectable: boolean
  connectCheckError?: string
  lastSeenAt?: number
  pairedAt: number
  /** Single source of truth for send readiness. */
  ready: boolean
  linkStatus: PairedLinkStatus
}

/**
 * Paired devices only (no LAN discovery APIs). Intended for plugins: use this
 * for device lists; do not call `startScan` / `startDiscovery` from plugin code.
 */
export function usePairedDevices() {
  const { peers, openTransportLinks, ensureReady } = useTransport()
  const pairedRecords = ref<SynraPairedDeviceRecord[]>([])

  async function reloadPairedRecords(): Promise<void> {
    const raw = await SynraPreferences.get({ key: SYNRA_PAIRED_DEVICES_KEY })
    pairedRecords.value = parsePairedDevicesPayload(raw.value).items
  }

  onMounted(() => {
    void ensureReady()
      .then(() => reloadPairedRecords())
      .catch(() => undefined)
  })

  watch(pairedDevicesStorageEpoch, () => {
    void reloadPairedRecords()
  })

  const pairedDevices = computed((): PairedDeviceRow[] => {
    const linkPhases = getPairedLinkPhases().value
    const pairAwaiting = getPairAwaitingAcceptDeviceIds().value
    const byId = new Map(peers.value.map((p) => [p.deviceId, p]))
    return pairedRecords.value.map((record) => {
      const live = byId.get(record.deviceId)
      const transportPending = linkPhases.has(record.deviceId)
      const pairPending = pairAwaiting.has(record.deviceId)
      const ready = Boolean(
        findReadyTransportLinkForDevice({
          deviceId: record.deviceId,
          devices: peers.value,
          links: openTransportLinks.value
        })
      )
      let linkStatus: PairedLinkStatus = 'disconnected'
      if (ready && !transportPending && !pairPending) {
        linkStatus = 'connected'
      } else if (transportPending || pairPending) {
        linkStatus = 'connecting'
      } else if (live) {
        linkStatus = 'idle'
      }
      return {
        deviceId: record.deviceId,
        name: live?.name ?? record.displayName,
        ipAddress: live?.ipAddress ?? record.lastResolvedHost ?? '',
        port: live?.port ?? record.lastResolvedPort,
        source: live?.source,
        connectable: live?.connectable ?? false,
        connectCheckError: live?.connectCheckError,
        lastSeenAt: live?.lastSeenAt,
        pairedAt: record.pairedAt,
        ready,
        linkStatus
      }
    })
  })

  return {
    pairedDevices,
    reloadPairedRecords
  }
}
