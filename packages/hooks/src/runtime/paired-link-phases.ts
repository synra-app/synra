import { ref } from 'vue'

/** Per `deviceId`: UI yellow dot while outbound TCP transport is opening (connecting). */
const phases = ref(new Map<string, 'connecting'>())

export function getPairedLinkPhases(): typeof phases {
  return phases
}

export function setPairedDeviceConnecting(deviceId: string, connecting: boolean): void {
  const next = new Map(phases.value)
  if (connecting) {
    next.set(deviceId, 'connecting')
  } else {
    next.delete(deviceId)
  }
  phases.value = next
}
