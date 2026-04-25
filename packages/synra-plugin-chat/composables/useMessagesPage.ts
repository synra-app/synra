import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { usePairedDevices, useTransport } from '@synra/plugin-sdk/hooks'
import { isObjectPayload, normalizePayloadToText, resolveErrorMessage } from './chatPayload'
import type { ChatDeviceListItem, ChatMessage } from '../src/types/chat'
import { CHAT_TEXT_EVENT } from '../src/events'

export function useMessagesPage() {
  const { pairedDevices, reloadPairedRecords } = usePairedDevices()
  const { sendMessageToReadyDevice, onSynraMessage, ensureReady } = useTransport()

  const messageInput = ref('')
  const selectedDeviceId = ref<string>('')
  const sending = ref(false)
  const sendError = ref<string | null>(null)
  const messages = ref<ChatMessage[]>([])

  const devices = computed((): ChatDeviceListItem[] =>
    pairedDevices.value.map((device) => ({
      deviceId: device.deviceId,
      name: device.name,
      ipAddress: device.ipAddress,
      linkStatus: device.linkStatus,
      ready: device.ready,
      isSelected: selectedDeviceId.value === device.deviceId,
      pairedAtLabel: new Date(device.pairedAt).toLocaleString()
    }))
  )

  const selectedDevice = computed(
    () => devices.value.find((device) => device.deviceId === selectedDeviceId.value) ?? null
  )
  const selectedDeviceLabel = computed(
    () => selectedDevice.value?.name ?? selectedDevice.value?.deviceId ?? '未选择设备'
  )
  const selectedReady = computed(() => Boolean(selectedDevice.value?.ready))
  const selectedStatusShort = computed(() => {
    if (!selectedDevice.value) {
      return '未选择设备'
    }
    if (selectedReady.value) {
      return '可发送'
    }
    return '设备未就绪，请在主程序完成连接'
  })
  const selectedStatusLong = computed(() => {
    if (!selectedDevice.value) {
      return '请选择左侧设备'
    }
    if (selectedReady.value) {
      return '已连接，可发送消息'
    }
    return '设备未就绪：请在主程序连接后再发消息'
  })
  const canSend = computed(
    () =>
      Boolean(selectedDevice.value?.deviceId) &&
      selectedReady.value &&
      messageInput.value.trim().length > 0 &&
      !sending.value
  )

  function selectDevice(deviceId: string): void {
    selectedDeviceId.value = deviceId
  }

  watch(selectedDeviceId, () => {
    sendError.value = null
  })

  watch(
    devices,
    (rows) => {
      if (rows.length === 0) {
        selectedDeviceId.value = ''
        return
      }
      const stillExists = rows.some((row) => row.deviceId === selectedDeviceId.value)
      if (!stillExists) {
        selectedDeviceId.value = rows[0].deviceId
      }
    },
    { immediate: true }
  )

  async function refreshPairedList(): Promise<void> {
    await ensureReady()
    await reloadPairedRecords()
  }

  async function onSendMessage(): Promise<void> {
    if (!selectedDevice.value || !canSend.value) {
      return
    }
    const content = messageInput.value.trim()
    const createdAt = Date.now()
    const optimisticId = `outgoing-${createdAt}`
    messages.value = [
      ...messages.value,
      {
        id: optimisticId,
        deviceId: selectedDevice.value.deviceId,
        direction: 'outgoing',
        text: content,
        timestamp: createdAt,
        timeLabel: new Date(createdAt).toLocaleTimeString(),
        status: 'sent'
      }
    ]
    sending.value = true
    sendError.value = null
    try {
      if (!selectedReady.value) {
        throw new Error('设备未就绪，请稍后重试。')
      }
      await sendMessageToReadyDevice({
        deviceId: selectedDevice.value.deviceId,
        event: CHAT_TEXT_EVENT,
        payload: {
          channel: 'default',
          body: content
        }
      })
      messageInput.value = ''
    } catch (error) {
      sendError.value = resolveErrorMessage(error, '发送失败')
      messages.value = messages.value.filter((row) => row.id !== optimisticId)
    } finally {
      sending.value = false
    }
  }

  const unsubscribe = onSynraMessage(
    (message) => {
      const outerPayload = isObjectPayload(message.payload) ? message.payload : null
      const wirePayload =
        outerPayload && isObjectPayload(outerPayload.payload) ? outerPayload.payload : outerPayload
      const body = wirePayload && 'body' in wirePayload ? wirePayload.body : message.payload
      const receivedAt = message.timestamp
      messages.value = [
        ...messages.value,
        {
          id: `incoming-${receivedAt}-${Math.random().toString(16).slice(2, 8)}`,
          deviceId: message.from,
          direction: 'incoming',
          text: normalizePayloadToText(body),
          timestamp: receivedAt,
          timeLabel: new Date(receivedAt).toLocaleTimeString(),
          status: 'received'
        }
      ]
    },
    {
      event: CHAT_TEXT_EVENT
    }
  )

  onMounted(() => {
    void refreshPairedList()
  })
  onUnmounted(() => unsubscribe())

  return {
    canSend,
    devices,
    messageInput,
    messages,
    onSendMessage,
    refreshPairedList,
    selectDevice,
    selectedDevice,
    selectedDeviceId,
    selectedDeviceLabel,
    selectedReady,
    selectedStatusLong,
    selectedStatusShort,
    sendError,
    sending
  }
}
