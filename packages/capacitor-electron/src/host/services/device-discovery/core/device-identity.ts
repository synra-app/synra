import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
import { join } from 'node:path'

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function hashDeviceId(input: string): string {
  return `device-${createHash('sha1').update(input).digest('hex').slice(0, 12)}`
}

export function localDisplayName(): string {
  const value = hostname().trim()
  return value.length > 0 ? value : 'Synra'
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
