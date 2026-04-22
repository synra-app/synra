import {
  SYNRA_DEVICE_BASIC_INFO_KEY,
  SynraPreferences,
  type SynraDeviceBasicInfo
} from '@synra/capacitor-preferences'

function defaultDeviceNameFromUuid(uuid: string): string {
  const raw = uuid.replace(/-/g, '').toLowerCase()
  if (raw.length >= 6) {
    return raw.slice(0, 6)
  }
  return raw.length > 0 ? raw : 'device'
}

export function parseDeviceNameFromBasicInfo(raw: string | null): string {
  if (!raw || raw.length === 0) {
    return ''
  }
  try {
    const parsed = JSON.parse(raw) as { deviceName?: unknown }
    return typeof parsed.deviceName === 'string' ? parsed.deviceName.trim() : ''
  } catch {
    return ''
  }
}

export async function ensureDeviceBasicInfo(deviceInstanceUuid: string): Promise<string> {
  const current = await SynraPreferences.get({ key: SYNRA_DEVICE_BASIC_INFO_KEY })
  const existingName = parseDeviceNameFromBasicInfo(current.value)
  if (existingName.length > 0) {
    return existingName
  }

  const defaultName = defaultDeviceNameFromUuid(deviceInstanceUuid)
  const payload: SynraDeviceBasicInfo = {
    deviceName: defaultName
  }
  await SynraPreferences.set({
    key: SYNRA_DEVICE_BASIC_INFO_KEY,
    value: JSON.stringify(payload)
  })
  return defaultName
}
