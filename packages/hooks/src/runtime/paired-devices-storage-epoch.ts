import { ref } from 'vue'

/** Incremented when paired-device preferences change so `usePairedDevices` can reload. */
export const pairedDevicesStorageEpoch = ref(0)

export function bumpPairedDevicesStorageEpoch(): void {
  pairedDevicesStorageEpoch.value += 1
}
