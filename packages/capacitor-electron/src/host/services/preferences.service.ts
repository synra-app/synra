import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { SYNRA_DEVICE_INSTANCE_UUID_KEY } from '@synra/capacitor-preferences'

const NAMESPACED_PREFIX = 'synra.preferences.'

function namespacedKey(key: string): string {
  return `${NAMESPACED_PREFIX}${key}`
}

function readStore(storePath: string): Record<string, string> {
  try {
    if (!existsSync(storePath)) {
      return {}
    }
    const raw = readFileSync(storePath, 'utf8').trim()
    if (!raw) {
      return {}
    }
    const data = JSON.parse(raw) as unknown
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return {}
    }
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (typeof v === 'string') {
        out[k] = v
      }
    }
    return out
  } catch {
    return {}
  }
}

function writeStore(storePath: string, data: Record<string, string>): void {
  const dir = dirname(storePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(storePath, JSON.stringify(data), 'utf8')
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function tryMigrateLegacyDeviceUuid(
  storePath: string,
  data: Record<string, string>
): string | null {
  const nk = namespacedKey(SYNRA_DEVICE_INSTANCE_UUID_KEY)
  if (typeof data[nk] === 'string' && data[nk].length > 0) {
    return data[nk]
  }
  const legacyFile = join(homedir(), '.synra', 'device-uuid')
  try {
    if (!existsSync(legacyFile)) {
      return null
    }
    const legacy = readFileSync(legacyFile, 'utf8').trim()
    if (legacy && isUuidLike(legacy)) {
      data[nk] = legacy
      writeStore(storePath, data)
      return legacy
    }
  } catch {
    return null
  }
  return null
}

export type PreferencesService = {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
  ensureDeviceInstanceUuid(): string
}

export function createPreferencesService(options: { storePath: string }): PreferencesService {
  const { storePath } = options

  return {
    get(key: string): string | null {
      const data = readStore(storePath)
      const v = data[namespacedKey(key)]
      return typeof v === 'string' ? v : null
    },

    set(key: string, value: string): void {
      const data = readStore(storePath)
      data[namespacedKey(key)] = value
      writeStore(storePath, data)
    },

    remove(key: string): void {
      const data = readStore(storePath)
      delete data[namespacedKey(key)]
      writeStore(storePath, data)
    },

    ensureDeviceInstanceUuid(): string {
      let data = readStore(storePath)
      const migrated = tryMigrateLegacyDeviceUuid(storePath, data)
      if (migrated) {
        return migrated
      }
      data = readStore(storePath)
      const nk = namespacedKey(SYNRA_DEVICE_INSTANCE_UUID_KEY)
      const existing = data[nk]
      if (typeof existing === 'string' && existing.length > 0 && isUuidLike(existing)) {
        return existing
      }
      const created = randomUUID()
      data[nk] = created
      writeStore(storePath, data)
      return created
    }
  }
}
