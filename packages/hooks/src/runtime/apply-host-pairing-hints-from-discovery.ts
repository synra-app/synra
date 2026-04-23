import {
  SYNRA_PAIRED_DEVICES_KEY,
  SynraPreferences,
  parsePairedDevicesPayload,
  serializePairedDevicesPayload
} from '@synra/capacitor-preferences'
import { bumpPairedDevicesStorageEpoch } from './paired-devices-storage-epoch'
import { SYNRA_CONNECT_ACK_HOST_LISTS_PEER_AS_PAIRED } from './synra-connect-ack-app-keys'

export type SynraDiscoveryPairingHint = {
  canonicalDeviceId: string
  connectAckPayload?: Record<string, unknown>
}

export async function applyHostPairingHintsFromDiscovery(
  hints: SynraDiscoveryPairingHint[]
): Promise<void> {
  let changed = false
  for (const hint of hints) {
    const id = hint.canonicalDeviceId.trim()
    if (!id) {
      continue
    }
    const payload = hint.connectAckPayload
    if (!payload) {
      continue
    }
    if (payload[SYNRA_CONNECT_ACK_HOST_LISTS_PEER_AS_PAIRED] !== false) {
      continue
    }
    const raw = await SynraPreferences.get({ key: SYNRA_PAIRED_DEVICES_KEY })
    const parsed = parsePairedDevicesPayload(raw.value)
    const nextItems = parsed.items.filter((item) => item.deviceId !== id)
    if (nextItems.length === parsed.items.length) {
      continue
    }
    await SynraPreferences.set({
      key: SYNRA_PAIRED_DEVICES_KEY,
      value: serializePairedDevicesPayload({ ...parsed, items: nextItems })
    })
    changed = true
  }
  if (changed) {
    bumpPairedDevicesStorageEpoch()
  }
}
