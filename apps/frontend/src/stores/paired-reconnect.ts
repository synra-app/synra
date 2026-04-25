import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { PairedReconnectScheduler } from '../lib/paired-reconnect-scheduler'

export const usePairedReconnectStore = defineStore('paired-reconnect', () => {
  const gaveUpByDeviceId = ref<Record<string, boolean>>({})
  const scheduler = shallowRef<PairedReconnectScheduler | null>(null)

  const reconnectGaveUpByDeviceId = computed(() => gaveUpByDeviceId.value)

  function isGaveUp(deviceId: string): boolean {
    return gaveUpByDeviceId.value[deviceId] === true
  }

  function setGaveUp(deviceId: string): void {
    if (gaveUpByDeviceId.value[deviceId]) {
      return
    }
    gaveUpByDeviceId.value = { ...gaveUpByDeviceId.value, [deviceId]: true }
  }

  function clearGaveUp(deviceId: string): void {
    if (!gaveUpByDeviceId.value[deviceId]) {
      return
    }
    const { [deviceId]: _removed, ...rest } = gaveUpByDeviceId.value
    gaveUpByDeviceId.value = rest
  }

  function assignScheduler(next: PairedReconnectScheduler | null): void {
    scheduler.value = next
  }

  function getScheduler(): PairedReconnectScheduler | null {
    return scheduler.value
  }

  function forgetPairedDevice(deviceId: string): void {
    clearGaveUp(deviceId)
    scheduler.value?.unpairOrForget(deviceId)
  }

  return {
    gaveUpByDeviceId,
    reconnectGaveUpByDeviceId,
    isGaveUp,
    setGaveUp,
    clearGaveUp,
    assignScheduler,
    getScheduler,
    forgetPairedDevice
  }
})
