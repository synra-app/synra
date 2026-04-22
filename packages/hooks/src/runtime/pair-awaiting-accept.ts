import { ref } from 'vue'

/** Initiator: sent `pair.request`, waiting for `accept` / `reject` (yellow dot). */
const awaitingByDeviceId = ref(new Set<string>())

export function getPairAwaitingAcceptDeviceIds(): typeof awaitingByDeviceId {
  return awaitingByDeviceId
}

export function setPairAwaitingAccept(deviceId: string, active: boolean): void {
  const next = new Set(awaitingByDeviceId.value)
  if (active) {
    next.add(deviceId)
  } else {
    next.delete(deviceId)
  }
  awaitingByDeviceId.value = next
}
