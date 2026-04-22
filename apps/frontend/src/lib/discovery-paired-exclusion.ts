import { ref } from 'vue'

const pairedIdsExcludedFromDiscovery = ref(new Set<string>())

export function syncPairedDiscoveryExclusionFromRecords(
  records: ReadonlyArray<{ deviceId: string }>
): void {
  pairedIdsExcludedFromDiscovery.value = new Set(records.map((record) => record.deviceId))
}

export function isPairedDeviceExcludedFromDiscovery(deviceId: string): boolean {
  return pairedIdsExcludedFromDiscovery.value.has(deviceId)
}
