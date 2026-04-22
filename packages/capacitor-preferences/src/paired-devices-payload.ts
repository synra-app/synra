import type { SynraPairedDeviceRecord, SynraPairedDevicesPayload } from './constants'

const CURRENT_VERSION = 1

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readPairedDeviceRecord(entry: unknown): SynraPairedDeviceRecord | undefined {
  if (!isRecord(entry)) {
    return undefined
  }
  const deviceId = entry.deviceId
  const displayName = entry.displayName
  const pairedAt = entry.pairedAt
  if (typeof deviceId !== 'string' || deviceId.trim().length === 0) {
    return undefined
  }
  if (typeof displayName !== 'string' || displayName.trim().length === 0) {
    return undefined
  }
  if (typeof pairedAt !== 'number' || !Number.isFinite(pairedAt)) {
    return undefined
  }
  const lastResolvedHost = entry.lastResolvedHost
  const lastResolvedPort = entry.lastResolvedPort
  const hostTrimmed =
    typeof lastResolvedHost === 'string' && lastResolvedHost.trim().length > 0
      ? lastResolvedHost.trim()
      : undefined
  let portResolved: number | undefined =
    typeof lastResolvedPort === 'number' &&
    Number.isInteger(lastResolvedPort) &&
    lastResolvedPort > 0
      ? lastResolvedPort
      : undefined
  if (!hostTrimmed) {
    portResolved = undefined
  }
  const out: SynraPairedDeviceRecord = {
    deviceId: deviceId.trim(),
    displayName: displayName.trim(),
    pairedAt,
    lastResolvedHost: hostTrimmed,
    lastResolvedPort: portResolved
  }
  return out
}

export function emptyPairedDevicesPayload(): SynraPairedDevicesPayload {
  return { version: CURRENT_VERSION, items: [] }
}

export function parsePairedDevicesPayload(
  raw: string | null | undefined
): SynraPairedDevicesPayload {
  if (raw === null || raw === undefined || raw.trim().length === 0) {
    return emptyPairedDevicesPayload()
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) {
      return emptyPairedDevicesPayload()
    }
    const version = parsed.version
    const itemsRaw = parsed.items
    if (version !== CURRENT_VERSION || !Array.isArray(itemsRaw)) {
      return emptyPairedDevicesPayload()
    }
    const items: SynraPairedDeviceRecord[] = []
    for (const entry of itemsRaw) {
      const record = readPairedDeviceRecord(entry)
      if (record) {
        items.push(record)
      }
    }
    return { version: CURRENT_VERSION, items }
  } catch {
    return emptyPairedDevicesPayload()
  }
}

export function serializePairedDevicesPayload(payload: SynraPairedDevicesPayload): string {
  const normalized: SynraPairedDevicesPayload = {
    version: CURRENT_VERSION,
    items: payload.items.map((item) => ({
      deviceId: item.deviceId.trim(),
      displayName: item.displayName.trim(),
      pairedAt: item.pairedAt,
      ...(typeof item.lastResolvedHost === 'string' && item.lastResolvedHost.trim().length > 0
        ? {
            lastResolvedHost: item.lastResolvedHost.trim(),
            ...(typeof item.lastResolvedPort === 'number' &&
            Number.isInteger(item.lastResolvedPort) &&
            item.lastResolvedPort > 0
              ? { lastResolvedPort: item.lastResolvedPort }
              : {})
          }
        : {})
    }))
  }
  return JSON.stringify(normalized)
}
