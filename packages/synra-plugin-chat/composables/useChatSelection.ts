import { computed, watch, type ComputedRef, type Ref } from 'vue'
import type { SynraHookDevice } from '@synra/plugin-sdk/hooks'
import type { ChatDevice, ChatSession } from '../src/types/chat'

export function useChatSelection(options: {
  activeSessions: ComputedRef<ChatSession[]>
  rawDevices: Ref<readonly SynraHookDevice[]>
  devices: ComputedRef<ChatDevice[]>
  selectedDeviceId: Ref<string>
  selectedSessionId: Ref<string>
}): {
  selectedDevice: ComputedRef<SynraHookDevice | undefined>
  selectedSession: ComputedRef<ChatSession | undefined>
  selectedDeviceLabel: ComputedRef<string>
  openSession: (sessionId: string) => void
  selectDevice: (deviceId: string) => void
} {
  const { activeSessions, rawDevices, devices, selectedDeviceId, selectedSessionId } = options

  const selectedDevice = computed(() =>
    rawDevices.value.find((device) => device.deviceId === selectedDeviceId.value)
  )

  const selectedSession = computed(() =>
    activeSessions.value.find((item) => item.sessionId === selectedSessionId.value)
  )

  const selectedDeviceLabel = computed(
    () =>
      (typeof selectedDevice.value?.name === 'string' && selectedDevice.value.name.length > 0
        ? selectedDevice.value.name
        : undefined) ??
      selectedSession.value?.deviceId ??
      'Choose device'
  )

  watch(
    activeSessions,
    (sessions) => {
      if (sessions.length === 0) {
        selectedSessionId.value = ''
        return
      }
      if (
        selectedSessionId.value &&
        sessions.some((item) => item.sessionId === selectedSessionId.value)
      ) {
        return
      }
      selectedSessionId.value = sessions[0].sessionId
    },
    { immediate: true }
  )

  watch(
    [selectedSession, devices],
    ([session, deviceList]) => {
      if (session?.deviceId) {
        selectedDeviceId.value = session.deviceId
        return
      }
      if (!selectedDeviceId.value && deviceList.length > 0) {
        selectedDeviceId.value = deviceList[0].deviceId
      }
    },
    { immediate: true }
  )

  function openSession(sessionId: string): void {
    selectedSessionId.value = sessionId
    const session = activeSessions.value.find((item) => item.sessionId === sessionId)
    if (session?.deviceId) {
      selectedDeviceId.value = session.deviceId
    }
  }

  function selectDevice(deviceId: string): void {
    selectedDeviceId.value = deviceId
    const linkedSession = activeSessions.value.find(
      (session) => session.deviceId === deviceId && session.status === 'open'
    )
    selectedSessionId.value = linkedSession?.sessionId ?? ''
  }

  return {
    selectedDevice,
    selectedSession,
    selectedDeviceLabel,
    openSession,
    selectDevice
  }
}
