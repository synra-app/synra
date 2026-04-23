import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  SYNRA_DEVICE_BASIC_INFO_KEY,
  SYNRA_PAIRED_DEVICES_KEY,
  parsePairedDevicesPayload
} from '@synra/capacitor-preferences'
import { createPreferencesService } from '../../preferences.service'

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

const DEVICE_BASIC_INFO_FILE = 'device-basic-info.json'
const PREFERENCES_STORE_FILE = 'synra-preferences-store.json'

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

/** Whether the Synra preferences store lists the peer (wire `sourceDeviceId`, UUID or `device-*`) as paired. */
export function isWirePeerInMainPairedList(remoteWireSourceDeviceId: string): boolean {
  const trimmed = remoteWireSourceDeviceId.trim()
  if (!trimmed) {
    return false
  }
  const hashed = hashDeviceId(trimmed)
  const idsToMatch = new Set<string>([hashed, trimmed])
  for (const storePath of resolvePreferencesStorePaths()) {
    const preferencesService = createPreferencesService({ storePath })
    const raw = preferencesService.get(SYNRA_PAIRED_DEVICES_KEY)
    if (typeof raw !== 'string' || raw.length === 0) {
      continue
    }
    const parsed = parsePairedDevicesPayload(raw)
    for (const item of parsed.items) {
      const id = item.deviceId.trim()
      if (id.length > 0 && idsToMatch.has(id)) {
        return true
      }
    }
  }
  return false
}

function resolveElectronUserDataPreferencesStorePath(): string | undefined {
  try {
    const electronModule = require('electron') as { app?: { getPath: (name: string) => string } }
    if (electronModule.app?.getPath) {
      return join(electronModule.app.getPath('userData'), PREFERENCES_STORE_FILE)
    }
  } catch {
    return undefined
  }
  return undefined
}

function resolvePreferencesStorePaths(): string[] {
  const candidates = [
    resolveElectronUserDataPreferencesStorePath(),
    join(homedir(), '.synra', PREFERENCES_STORE_FILE)
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)
  return [...new Set(candidates)]
}

/** LAN hello `displayName`: prefer SynraPreferences basic-info, then legacy file, then UUID hex prefix. */
export function localDisplayName(): string {
  const dir = join(homedir(), '.synra')
  const path = join(dir, DEVICE_BASIC_INFO_FILE)
  const preferenceServices = resolvePreferencesStorePaths().map((storePath) =>
    createPreferencesService({ storePath })
  )
  const primaryPreferencesService = preferenceServices[0]
  try {
    for (const preferencesService of preferenceServices) {
      const fromPreferences = preferencesService.get(SYNRA_DEVICE_BASIC_INFO_KEY)
      if (typeof fromPreferences !== 'string' || fromPreferences.length === 0) {
        continue
      }
      const parsed = JSON.parse(fromPreferences) as { deviceName?: unknown }
      if (typeof parsed.deviceName === 'string') {
        const trimmed = parsed.deviceName.trim()
        if (trimmed.length > 0) {
          return trimmed
        }
      }
    }

    if (existsSync(path)) {
      const raw = readFileSync(path, 'utf8').trim()
      if (raw.length > 0) {
        const parsed = JSON.parse(raw) as { deviceName?: unknown }
        if (typeof parsed.deviceName === 'string') {
          const trimmed = parsed.deviceName.trim()
          if (trimmed.length > 0) {
            for (const preferencesService of preferenceServices) {
              preferencesService.set(
                SYNRA_DEVICE_BASIC_INFO_KEY,
                JSON.stringify({ deviceName: trimmed })
              )
            }
            return trimmed
          }
        }
      }
    }
    const uuid = primaryPreferencesService
      ? primaryPreferencesService.ensureDeviceInstanceUuid()
      : getOrCreateLocalDeviceUuid()
    const name = defaultDeviceNameFromUuid(uuid)
    for (const preferencesService of preferenceServices) {
      preferencesService.set(SYNRA_DEVICE_BASIC_INFO_KEY, JSON.stringify({ deviceName: name }))
    }
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
