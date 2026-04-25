import {
  SYNRA_PAIRED_DEVICES_KEY,
  SynraPreferences,
  emptyPairedDevicesPayload,
  parsePairedDevicesPayload,
  serializePairedDevicesPayload,
  type SynraPairedDeviceRecord,
  type SynraPairedDevicesPayload
} from '@synra/capacitor-preferences'
import { isIpv4Address } from './network'

export type { SynraPairedDeviceRecord, SynraPairedDevicesPayload }

export async function loadPairedDevicesPayload(): Promise<SynraPairedDevicesPayload> {
  const raw = await SynraPreferences.get({ key: SYNRA_PAIRED_DEVICES_KEY })
  return parsePairedDevicesPayload(raw.value)
}

/** Re-serialize stored JSON so invalid `lastResolvedPort`-without-host rows are stripped. */
export async function repairPairedDevicesPersistenceIfNeeded(): Promise<void> {
  const raw = await SynraPreferences.get({ key: SYNRA_PAIRED_DEVICES_KEY })
  const parsed = parsePairedDevicesPayload(raw.value)
  const normalized = serializePairedDevicesPayload(parsed)
  if (raw.value !== null && raw.value !== undefined && raw.value !== normalized) {
    await SynraPreferences.set({ key: SYNRA_PAIRED_DEVICES_KEY, value: normalized })
  }
}

export async function savePairedDevicesPayload(payload: SynraPairedDevicesPayload): Promise<void> {
  await SynraPreferences.set({
    key: SYNRA_PAIRED_DEVICES_KEY,
    value: serializePairedDevicesPayload(payload)
  })
}

export async function listPairedDeviceRecords(): Promise<SynraPairedDeviceRecord[]> {
  const payload = await loadPairedDevicesPayload()
  return payload.items
}

export async function upsertPairedDeviceRecord(record: SynraPairedDeviceRecord): Promise<void> {
  const payload = await loadPairedDevicesPayload()
  const existing = payload.items.find((item) => item.deviceId === record.deviceId)
  const incomingHost =
    typeof record.lastResolvedHost === 'string' ? record.lastResolvedHost.trim() : ''
  const nextRecord: SynraPairedDeviceRecord =
    existing && !isIpv4Address(incomingHost)
      ? {
          ...record,
          lastResolvedHost: existing.lastResolvedHost,
          lastResolvedPort: existing.lastResolvedPort
        }
      : record
  const others = payload.items.filter((item) => item.deviceId !== record.deviceId)
  await savePairedDevicesPayload({
    ...payload,
    items: [...others, nextRecord].sort((a, b) => b.pairedAt - a.pairedAt)
  })
}

/** Update stored display name when a paired peer broadcasts a rename. */
export async function patchPairedDeviceDisplayName(
  deviceId: string,
  displayName: string
): Promise<boolean> {
  const id = deviceId.trim()
  const name = displayName.trim()
  if (!id || !name) {
    return false
  }
  const payload = await loadPairedDevicesPayload()
  const existing = payload.items.find((item) => item.deviceId === id)
  if (!existing) {
    return false
  }
  await upsertPairedDeviceRecord({ ...existing, displayName: name })
  return true
}

export async function removePairedDeviceRecord(deviceId: string): Promise<void> {
  const payload = await loadPairedDevicesPayload()
  await savePairedDevicesPayload({
    ...payload,
    items: payload.items.filter((item) => item.deviceId !== deviceId)
  })
}

export function createEmptyPairedDevicesPayload(): SynraPairedDevicesPayload {
  return emptyPairedDevicesPayload()
}
