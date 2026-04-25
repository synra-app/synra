import { ref } from 'vue'
import { isIpv4Address } from './network'

const pairedIdsExcludedFromDiscovery = ref(new Set<string>())

function hasResolvableHost(record: { lastResolvedHost?: string | null }): boolean {
  const host = typeof record.lastResolvedHost === 'string' ? record.lastResolvedHost.trim() : ''
  return isIpv4Address(host)
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
