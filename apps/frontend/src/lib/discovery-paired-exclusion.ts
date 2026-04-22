import { ref } from 'vue'

const pairedIdsExcludedFromDiscovery = ref(new Set<string>())

function hasResolvableHost(record: { lastResolvedHost?: string | null }): boolean {
  const host = typeof record.lastResolvedHost === 'string' ? record.lastResolvedHost.trim() : ''
  if (host.length === 0) {
    return false
  }
  const parts = host.split('.')
  if (parts.length !== 4) {
    return false
  }
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255)
}

export function syncPairedDiscoveryExclusionFromRecords(
  records: ReadonlyArray<{ deviceId: string; lastResolvedHost?: string | null }>
): void {
  pairedIdsExcludedFromDiscovery.value = new Set(
    records.filter((record) => hasResolvableHost(record)).map((record) => record.deviceId)
  )
}

export function isPairedDeviceExcludedFromDiscovery(deviceId: string): boolean {
  return pairedIdsExcludedFromDiscovery.value.has(deviceId)
}
