import type { SynraMessageType } from '@synra/protocol'

/** Broadcast when this device's display name changes (settings); peers update list by `deviceId`. */
export const DEVICE_PROFILE_UPDATED_MESSAGE_TYPE =
  'custom.device.profileUpdated' as SynraMessageType

export type DeviceProfileUpdatedPayload = {
  deviceId: string
  displayName: string
  updatedAt: number
}

export function isDeviceProfileUpdatedPayload(
  value: unknown
): value is DeviceProfileUpdatedPayload {
  if (!value || typeof value !== 'object') {
    return false
  }
  const o = value as Record<string, unknown>
  const deviceId = o.deviceId
  const displayName = o.displayName
  const updatedAt = o.updatedAt
  return (
    typeof deviceId === 'string' &&
    deviceId.trim().length > 0 &&
    typeof displayName === 'string' &&
    displayName.trim().length > 0 &&
    typeof updatedAt === 'number' &&
    Number.isFinite(updatedAt)
  )
}
