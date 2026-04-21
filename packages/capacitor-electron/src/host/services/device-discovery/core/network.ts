import { networkInterfaces } from 'node:os'

export type NetworkSeed = {
  address: string
}

export function collectInterfaceSeeds(includeLoopback: boolean): NetworkSeed[] {
  const seeds: NetworkSeed[] = []
  const interfaces = networkInterfaces()
  for (const records of Object.values(interfaces)) {
    for (const record of records ?? []) {
      if (record.family !== 'IPv4') {
        continue
      }
      if (record.internal && !includeLoopback) {
        continue
      }
      seeds.push({ address: record.address })
    }
  }
  return seeds
}

export function collectLocalIpSet(includeLoopback: boolean): Set<string> {
  return new Set(collectInterfaceSeeds(includeLoopback).map((seed) => seed.address))
}

export function pickPrimarySourceHostIp(): string | undefined {
  const candidates = collectInterfaceSeeds(false)
    .map((seed) => seed.address)
    .filter((address) => !address.startsWith('169.254.'))
    .sort((left, right) => left.localeCompare(right))
  return candidates[0]
}

export function normalizeRemoteIp(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }
  const normalized = value.replace(/^::ffff:/i, '').trim()
  const segments = normalized.split('.')
  if (segments.length !== 4) {
    return undefined
  }
  for (const segment of segments) {
    if (!/^\d{1,3}$/.test(segment)) {
      return undefined
    }
    const num = Number(segment)
    if (num < 0 || num > 255) {
      return undefined
    }
  }
  return normalized
}
