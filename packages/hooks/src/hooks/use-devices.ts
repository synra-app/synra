import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { getConnectionRuntime } from '../runtime/core'

export function useDevices() {
  const runtime = getConnectionRuntime()
  const connectableDevices = computed(() =>
    runtime.devices.value.filter((device) => Boolean(device.connectable))
  )

  return {
    devices: runtime.devices,
    connectableDevices,
    loading: runtime.loading,
    error: runtime.error,
    refreshDevices: () => runtime.refreshDevices()
  }
}

export function useDevice(deviceId: MaybeRefOrGetter<string | null | undefined>) {
  const runtime = getConnectionRuntime()
  const resolvedDeviceId = computed(() => toValue(deviceId) ?? '')

  const device = computed(
    () => runtime.devices.value.find((item) => item.deviceId === resolvedDeviceId.value) ?? null
  )

  const isConnectable = computed(() => Boolean(device.value?.connectable))
  const isConnected = computed(() =>
    runtime.connectedSessions.value.some(
      (session) => session.deviceId === resolvedDeviceId.value && session.status === 'open'
    )
  )

  return {
    device,
    isConnectable,
    isConnected
  }
}
