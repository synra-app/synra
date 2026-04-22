/** Matches native / Electron `hashDeviceId` (SHA-1 prefix) for LAN `deviceId` strings. */
export async function hashDeviceIdFromInstanceUuid(instanceUuid: string): Promise<string> {
  const normalized = instanceUuid.trim()
  if (normalized.length === 0) {
    return 'device-unknown'
  }
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(normalized))
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `device-${hex.slice(0, 12)}`
}
