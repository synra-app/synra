import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useSynraHooksAdapter } from './context'

export function useDevices() {
  const adapter = useSynraHooksAdapter()
  const pairedDevices = computed(() =>
    adapter.devices.value.filter((device) => Boolean(device.paired))
  )
  const connectableDevices = computed(() =>
    adapter.devices.value.filter((device) => Boolean(device.connectable))
  )

  return {
    devices: adapter.devices,
    pairedDevices,
    connectableDevices,
    loading: adapter.loading,
    error: adapter.error,
    refreshDevices: () => adapter.refreshDevices(),
    pairDevice: (deviceId: string) => adapter.pairDevice(deviceId)
  }
}

export function useDevice(deviceId: MaybeRefOrGetter<string | null | undefined>) {
  const adapter = useSynraHooksAdapter()
  const resolvedDeviceId = computed(() => toValue(deviceId) ?? '')

  const device = computed(
    () => adapter.devices.value.find((item) => item.deviceId === resolvedDeviceId.value) ?? null
  )

  const isPaired = computed(() => Boolean(device.value?.paired))
  const isConnectable = computed(() => Boolean(device.value?.connectable))
  const isConnected = computed(() =>
    adapter.connectedSessions.value.some(
      (session) => session.deviceId === resolvedDeviceId.value && session.status === 'open'
    )
  )

  return {
    device,
    isPaired,
    isConnectable,
    isConnected
  }
}
