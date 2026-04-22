import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

const DEVICE_BASIC_INFO_FILE = 'device-basic-info.json'

function defaultDeviceNameFromUuid(uuid: string): string {
  const raw = uuid.replace(/-/g, '').toLowerCase()
  if (raw.length >= 6) {
    return raw.slice(0, 6)
  }
  return raw.length > 0 ? raw : 'device'
}

export function hashDeviceId(input: string): string {
  return `device-${createHash('sha1').update(input).digest('hex').slice(0, 12)}`
}

/** LAN hello `displayName`: from `~/.synra/device-basic-info.json` `deviceName`, else instance UUID hex prefix. */
export function localDisplayName(): string {
  const dir = join(homedir(), '.synra')
  const path = join(dir, DEVICE_BASIC_INFO_FILE)
  try {
    if (existsSync(path)) {
      const raw = readFileSync(path, 'utf8').trim()
      if (raw.length > 0) {
        const parsed = JSON.parse(raw) as { deviceName?: unknown }
        if (typeof parsed.deviceName === 'string') {
          const trimmed = parsed.deviceName.trim()
          if (trimmed.length > 0) {
            return trimmed
          }
        }
      }
    }
    const uuid = getOrCreateLocalDeviceUuid()
    const name = defaultDeviceNameFromUuid(uuid)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(path, JSON.stringify({ deviceName: name }), 'utf8')
    return name
  } catch {
    return defaultDeviceNameFromUuid(getOrCreateLocalDeviceUuid())
  }
}

export function getOrCreateLocalDeviceUuid(): string {
  const dir = join(homedir(), '.synra')
  const file = join(dir, 'device-uuid')
  try {
    if (existsSync(file)) {
      const existing = readFileSync(file, 'utf8').trim()
      if (existing.length > 0 && isUuidLike(existing)) {
        return existing
      }
    }
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    const created = randomUUID()
    writeFileSync(file, created, 'utf8')
    return created
  } catch {
    return randomUUID()
  }
}
