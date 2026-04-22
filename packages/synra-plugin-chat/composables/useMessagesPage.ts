import { computed, onMounted, onUnmounted, ref } from 'vue'
import { deriveDeviceCardBadge, useTransport } from '@synra/plugin-sdk/hooks'
import type { ChatMessage } from '../src/types/chat'

export function useMessagesPage() {
  const transport = useTransport()
  const { peers, connectedDeviceIds, loading, error, ensureReady, startScan } = transport
  const messageInput = ref('')
  const messageType = ref('default')
  const selectedDeviceId = ref<string>('')
  const sending = ref(false)
  const messages = ref<ChatMessage[]>([])

  const devices = computed(() => {
    const scanPhase = loading.value ? 'scanning' : 'idle'
    return peers.value.map((device) => ({
      deviceId: device.deviceId,
      name: device.name,
      ipAddress: device.ipAddress,
      source: device.source,
      connectable: device.connectable,
      connectCheckError: device.connectCheckError,
      lastSeenAt: device.lastSeenAt,
      lastSeenLabel: device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleTimeString() : '-',
      connectionStatus: connectedDeviceIds.value.includes(device.deviceId) ? 'connected' : 'idle',
      isSelected: selectedDeviceId.value === device.deviceId,
      badge: deriveDeviceCardBadge(device, scanPhase)
    }))
  })

  const selectedDevice = computed(
    () => devices.value.find((device) => device.deviceId === selectedDeviceId.value) ?? null
  )
  const selectedDeviceLabel = computed(
    () => selectedDevice.value?.name ?? selectedDevice.value?.deviceId ?? 'No device selected'
  )
  const canSend = computed(
    () =>
      Boolean(selectedDevice.value?.deviceId) &&
      messageInput.value.trim().length > 0 &&
      !sending.value
  )

  function selectDevice(deviceId: string): void {
    selectedDeviceId.value = deviceId
  }

  async function connectSelectedDevice(): Promise<void> {
    if (!selectedDevice.value) {
      return
    }
    await transport.connectToDevice(selectedDevice.value.deviceId)
  }

  async function disconnectSelectedDevice(): Promise<void> {
    if (!selectedDevice.value) {
      return
    }
    await transport.disconnectDevice(selectedDevice.value.deviceId)
  }

  async function reconnectSelectedDevice(): Promise<void> {
    await disconnectSelectedDevice()
    await connectSelectedDevice()
  }

  async function refreshDeviceDiscovery(): Promise<void> {
    await startScan()
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
        messageType: messageType.value,
        timestamp: createdAt,
        timeLabel: new Date(createdAt).toLocaleTimeString(),
        status: 'sent'
      }
    ]
    sending.value = true
    try {
      await transport.sendToDevice(selectedDevice.value.deviceId, {
        channel: messageType.value,
        payload: content
      })
      messageInput.value = ''
    } finally {
      sending.value = false
    }
  }

  const unsubscribe = transport.onMessage((message) => {
    const receivedAt = message.receivedAt
    messages.value = [
      ...messages.value,
      {
        id: `incoming-${receivedAt}-${Math.random().toString(16).slice(2, 8)}`,
        deviceId: message.fromDeviceId,
        direction: 'incoming',
        text:
          typeof message.payload === 'string' ? message.payload : JSON.stringify(message.payload),
        messageType: message.channel,
        timestamp: receivedAt,
        timeLabel: new Date(receivedAt).toLocaleTimeString(),
        status: 'received'
      }
    ]
  })

  onMounted(async () => {
    await ensureReady()
    await refreshDeviceDiscovery()
  })
  onUnmounted(() => unsubscribe())

  return {
    canSend,
    connectSelectedDevice,
    devices,
    disconnectSelectedDevice,
    error,
    loading,
    messages,
    messageInput,
    messageType,
    onSendMessage,
    reconnectSelectedDevice,
    refreshDeviceDiscovery,
    selectDevice,
    selectedDevice,
    selectedDeviceId,
    selectedDeviceLabel,
    sending
  }
}
