import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
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
import { normalizeHost } from '../runtime/host-normalization'
import { useTransport } from './use-transport'

export type PairedLinkStatus = 'disconnected' | 'idle' | 'connecting' | 'connected'

/**
 * Paired list surface fields: prefer persisted pairing record; LAN `live` is only a fallback
 * when storage has no host/name (never overwrite stored displayName / address with scan noise).
 */
export function pairedSurfaceFromRecordAndLive(
  record: SynraPairedDeviceRecord,
  live: DiscoveredDevice | undefined
): { name: string; ipAddress: string; port?: number } {
  const storedName = typeof record.displayName === 'string' ? record.displayName.trim() : ''
  const name =
    storedName.length > 0
      ? storedName
      : typeof live?.name === 'string' && live.name.trim().length > 0
        ? live.name.trim()
        : record.deviceId

  const liveHost = normalizeHost(live?.ipAddress ?? '')
  const storedHost = record.lastResolvedHost?.trim() ?? ''
  const hasStoredHost = storedHost.length > 0
  const ipAddress = hasStoredHost ? storedHost : liveHost.length > 0 ? liveHost : ''

  let port: number | undefined
  if (hasStoredHost) {
    port =
      typeof record.lastResolvedPort === 'number' && record.lastResolvedPort > 0
        ? record.lastResolvedPort
        : typeof live?.port === 'number' && live.port > 0
          ? live.port
          : undefined
  } else {
    port =
      typeof live?.port === 'number' && live.port > 0
        ? live.port
        : typeof record.lastResolvedPort === 'number' && record.lastResolvedPort > 0
          ? record.lastResolvedPort
          : undefined
  }

  return { name, ipAddress, port }
}

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
      const { name, ipAddress, port } = pairedSurfaceFromRecordAndLive(record, live)
      return {
        deviceId: record.deviceId,
        name,
        ipAddress,
        port,
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
