/** Canonical key for the app device instance UUID (shared with native TCP stacks). */
export const SYNRA_DEVICE_INSTANCE_UUID_KEY = 'synra.device.instance-uuid'

/**
 * JSON string in SynraPreferences: `{ "deviceName": string, ... }`.
 * `deviceName` is used for LAN hello / helloAck `displayName` on native hosts.
 */
export const SYNRA_DEVICE_BASIC_INFO_KEY = 'synra.device.basic-info'

/** Shape of {@link SYNRA_DEVICE_BASIC_INFO_KEY} JSON (additional fields allowed for forward compatibility). */
export type SynraDeviceBasicInfo = {
  deviceName: string
}

/**
 * JSON string in SynraPreferences: `{ "version": number, "items": SynraPairedDeviceRecord[] }`.
 * Persisted after successful device pairing (both peers store the other).
 */
export const SYNRA_PAIRED_DEVICES_KEY = 'synra.device.paired-peers'

export type SynraPairedDeviceRecord = {
  deviceId: string
  displayName: string
  pairedAt: number
  lastResolvedHost?: string
  lastResolvedPort?: number
}

export type SynraPairedDevicesPayload = {
  version: number
  items: SynraPairedDeviceRecord[]
}

/** Internal prefix for web localStorage keys to avoid collisions. */
export const SYNRA_PREFERENCES_STORAGE_PREFIX = 'synra.preferences.'
