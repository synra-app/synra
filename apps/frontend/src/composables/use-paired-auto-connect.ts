import type { Pinia } from 'pinia'
import type { SynraPairedDeviceRecord } from '@synra/capacitor-preferences'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'
import { getConnectionRuntime, setPairedDeviceConnecting } from '@synra/hooks'
import { listPairedDeviceRecords } from '../lib/paired-devices-storage'
import { useLanDiscoveryStore } from '../stores/lan-discovery'
import { usePairingStore } from '../stores/pairing'

function isIpv4Address(value: string | undefined): boolean {
  if (typeof value !== 'string') {
    return false
  }
  const segments = value.trim().split('.')
  if (segments.length !== 4) {
    return false
  }
  return segments.every(
    (segment) => /^\d{1,3}$/.test(segment) && Number(segment) >= 0 && Number(segment) <= 255
  )
}

/**
 * Keeps outbound sessions open for persisted paired peers once they appear in discovery
 * or when `lastResolvedHost` is known from pairing storage.
 */
export function registerPairedAutoConnect(pinia: Pinia): void {
  const store = useLanDiscoveryStore(pinia)
  const pairingStore = usePairingStore(pinia)
  const { peers, transportReadyDeviceIds } = storeToRefs(store)
  const { pairedListEpoch } = storeToRefs(pairingStore)

  const inFlight = new Set<string>()

  async function connectOne(record: SynraPairedDeviceRecord): Promise<void> {
    if (transportReadyDeviceIds.value.includes(record.deviceId)) {
      getConnectionRuntime().setAppLinkForDevice(record.deviceId, 'connected')
      setPairedDeviceConnecting(record.deviceId, false)
      return
    }
    const peer = peers.value.find(
      (item) =>
        item.deviceId === record.deviceId && item.connectable && isIpv4Address(item.ipAddress)
    )
    const host = record.lastResolvedHost?.trim()
    const canDialStoredHost = isIpv4Address(host)
    if (inFlight.has(record.deviceId)) {
      return
    }
    if (!peer && !canDialStoredHost) {
      return
    }
    inFlight.add(record.deviceId)
    setPairedDeviceConnecting(record.deviceId, true)
    try {
      if (peer) {
        await store.connectToDevice(record.deviceId, { suppressGlobalError: true })
      } else if (canDialStoredHost && host) {
        await store.connectToDeviceAt(record.deviceId, host, record.lastResolvedPort ?? 32100, {
          suppressGlobalError: true
        })
      }
      getConnectionRuntime().setAppLinkForDevice(record.deviceId, 'connected')
    } catch {
      // Best-effort reconnect; discovery will retry on next tick.
    } finally {
      inFlight.delete(record.deviceId)
      setPairedDeviceConnecting(record.deviceId, false)
    }
  }

  async function tick(): Promise<void> {
    const paired = await listPairedDeviceRecords()
    await Promise.all(paired.map((record) => connectOne(record)))
  }

  watch(
    [peers, pairedListEpoch],
    () => {
      void tick()
    },
    { deep: true, flush: 'post' }
  )

  void tick()
}
