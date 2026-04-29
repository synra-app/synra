import {
  SYNRA_DEVICE_BASIC_INFO_KEY,
  SynraPreferences,
  type SynraDeviceBasicInfo
} from '@synra/capacitor-preferences'
import { getHooksRuntimeOptions, useSynraSystemEnvelope, useTransport } from '@synra/hooks'
import { DEVICE_DISPLAY_NAME_CHANGED_EVENT } from '@synra/protocol'
import { ensureDeviceInstanceUuid } from '../lib/device-instance-uuid'
import { parseDeviceNameFromBasicInfo } from '../lib/device-basic-info'

type BasicInfoSaveStatus = 'idle' | 'saving' | 'success' | 'error'
type BasicInfoLoadStatus = 'idle' | 'loading' | 'ready' | 'error'

const DEVICE_NAME_MAX_LENGTH = 64

function validateDeviceName(input: string): string {
  const normalized = input.trim()
  if (normalized.length === 0) {
    throw new Error('Device name is required.')
  }
  if (normalized.length > DEVICE_NAME_MAX_LENGTH) {
    throw new Error(`Device name must be at most ${DEVICE_NAME_MAX_LENGTH} characters.`)
  }
  return normalized
}

export function useDeviceBasicInfo() {
  const transport = useTransport()
  const synra = useSynraSystemEnvelope()

  const deviceName = ref('')
  const loadStatus = ref<BasicInfoLoadStatus>('idle')
  const saveStatus = ref<BasicInfoSaveStatus>('idle')
  const statusMessage = ref('')
  let clearMessageTimer: ReturnType<typeof setTimeout> | undefined

  const isBusy = computed(() => loadStatus.value === 'loading' || saveStatus.value === 'saving')

  function clearStatusMessageAfterDelay(): void {
    if (clearMessageTimer) {
      clearTimeout(clearMessageTimer)
    }
    clearMessageTimer = setTimeout(() => {
      statusMessage.value = ''
      if (saveStatus.value !== 'saving') {
        saveStatus.value = 'idle'
      }
      clearMessageTimer = undefined
    }, 2500)
  }

  async function loadBasicInfo(): Promise<void> {
    loadStatus.value = 'loading'
    try {
      const result = await SynraPreferences.get({ key: SYNRA_DEVICE_BASIC_INFO_KEY })
      deviceName.value = parseDeviceNameFromBasicInfo(result.value)
      loadStatus.value = 'ready'
    } catch (error: unknown) {
      loadStatus.value = 'error'
      statusMessage.value = error instanceof Error ? error.message : 'Failed to load device info.'
    }
  }

  async function notifyConnectedDevices(nextDeviceName: string): Promise<number> {
    let deviceLanId = getHooksRuntimeOptions().localDiscoveryDeviceId
    if (typeof deviceLanId !== 'string' || deviceLanId.length === 0) {
      try {
        const uuid = await ensureDeviceInstanceUuid()
        deviceLanId = uuid
      } catch {
        return 1
      }
    }
    const links = transport.openTransportLinks.value.filter(
      (link) =>
        link.transport === 'ready' && typeof link.deviceId === 'string' && link.deviceId.length > 0
    )
    let failureCount = 0
    await Promise.all(
      links.map((link) =>
        synra
          .send({
            event: DEVICE_DISPLAY_NAME_CHANGED_EVENT,
            target: link.deviceId,
            payload: { deviceId: deviceLanId, displayName: nextDeviceName }
          })
          .catch(() => {
            failureCount += 1
          })
      )
    )
    return failureCount
  }

  async function saveBasicInfo(): Promise<void> {
    if (saveStatus.value === 'saving') {
      return
    }
    if (clearMessageTimer) {
      clearTimeout(clearMessageTimer)
      clearMessageTimer = undefined
    }

    saveStatus.value = 'saving'
    statusMessage.value = ''

    try {
      const normalized = validateDeviceName(deviceName.value)
      const payload: SynraDeviceBasicInfo = {
        deviceName: normalized
      }
      await SynraPreferences.set({
        key: SYNRA_DEVICE_BASIC_INFO_KEY,
        value: JSON.stringify(payload)
      })
      deviceName.value = normalized

      const failureCount = await notifyConnectedDevices(normalized)
      if (failureCount > 0) {
        saveStatus.value = 'success'
        statusMessage.value = `Saved. Notify failed on ${failureCount} connected device(s).`
      } else {
        saveStatus.value = 'success'
        statusMessage.value = 'Saved and notified connected devices.'
      }
    } catch (error: unknown) {
      saveStatus.value = 'error'
      statusMessage.value = error instanceof Error ? error.message : 'Failed to save device info.'
    }

    clearStatusMessageAfterDelay()
  }

  onMounted(() => {
    void loadBasicInfo()
  })

  onBeforeUnmount(() => {
    if (clearMessageTimer) {
      clearTimeout(clearMessageTimer)
      clearMessageTimer = undefined
    }
  })

  return {
    deviceName,
    isBusy,
    loadStatus,
    saveStatus,
    statusMessage,
    maxDeviceNameLength: DEVICE_NAME_MAX_LENGTH,
    loadBasicInfo,
    saveBasicInfo
  }
}
