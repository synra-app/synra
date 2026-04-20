import { computed, onMounted, ref, watch } from 'vue'
import type { ChatDevice, ChatMessage, ChatSession, SessionLogEntry } from '../src/types/chat'
import {
  useConnectionState,
  useDevices,
  useDiscovery,
  useSessionMessages
} from '@synra/plugin-sdk/hooks'
import type { SynraHookSendMessageInput } from '@synra/plugin-sdk/hooks'

function resolveErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function normalizePayloadToText(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload
  }
  if (typeof payload === 'number' || typeof payload === 'boolean') {
    return String(payload)
  }
  if (payload == null) {
    return ''
  }
  try {
    return JSON.stringify(payload)
  } catch {
    return '[unserializable payload]'
  }
}

function isObjectPayload(payload: unknown): payload is Record<string, unknown> {
  return Boolean(payload) && typeof payload === 'object'
}

const DEFAULT_SOCKET_PORT = 32100

export function useMessagesPage() {
  const {
    activeSessions: rawActiveSessions,
    closeSession,
    openSession: openSessionByDevice,
    reconnectDevice,
    syncSessionState
  } = useConnectionState()
  const { devices: rawDevices, refreshDevices } = useDevices()
  const { ensureListeners, loading, error: discoveryError, startDiscovery } = useDiscovery()
  const messageInput = ref('')
  const messageType = ref<SynraHookSendMessageInput['messageType']>('custom.chat.text')
  const selectedDeviceId = ref<string>('')
  const selectedSessionId = ref<string>('')
  const localError = ref<string | null>(null)
  const sending = ref(false)
  const failedMessageIds = ref<Set<string>>(new Set())
  const pendingMessages = ref<ChatMessage[]>([])

  const activeSessions = computed<ChatSession[]>(() =>
    rawActiveSessions.value.map((session) => ({
      sessionId: session.sessionId,
      deviceId: session.deviceId,
      host: typeof session.host === 'string' ? session.host : undefined,
      port: typeof session.port === 'number' ? session.port : undefined,
      remote: typeof session.remote === 'string' ? session.remote : undefined,
      direction: typeof session.direction === 'string' ? session.direction : undefined,
      status: typeof session.status === 'string' ? session.status : undefined,
      openedAt: typeof session.openedAt === 'number' ? session.openedAt : undefined,
      closedAt: typeof session.closedAt === 'number' ? session.closedAt : undefined,
      lastActiveAt:
        typeof session.lastActiveAt === 'number'
          ? new Date(session.lastActiveAt).toLocaleTimeString()
          : undefined
    }))
  )

  const selectedDevice = computed(() =>
    rawDevices.value.find((device) => device.deviceId === selectedDeviceId.value)
  )

  const selectedSession = computed(() =>
    activeSessions.value.find((item) => item.sessionId === selectedSessionId.value)
  )

  const {
    sessionLogs: rawSessionLogs,
    canSend: canSendBySession,
    sendMessage
  } = useSessionMessages(selectedSessionId)

  const sessionLogs = computed<SessionLogEntry[]>(() =>
    rawSessionLogs.value.map((log, index) => ({
      id: log.id ?? `${log.timestamp}-${index}`,
      timestamp: log.timestamp,
      type: log.type,
      payload: log.payload
    }))
  )

  const messageEvents = computed(() =>
    [...sessionLogs.value].sort((left, right) => left.timestamp - right.timestamp)
  )

  const messages = computed<ChatMessage[]>(() => {
    const mapped: ChatMessage[] = []
    const messageIndexById = new Map<string, number>()

    for (const entry of messageEvents.value) {
      if (entry.type === 'messageSent') {
        const payload = isObjectPayload(entry.payload) ? entry.payload : undefined
        const messageId = typeof payload?.messageId === 'string' ? payload.messageId : undefined
        const sessionId =
          typeof payload?.sessionId === 'string' ? payload.sessionId : selectedSessionId.value
        const text = normalizePayloadToText(payload?.payload)
        const status = messageId && failedMessageIds.value.has(messageId) ? 'failed' : 'sent'
        mapped.push({
          id: entry.id,
          sessionId,
          messageId,
          direction: 'outgoing',
          text,
          messageType: typeof payload?.messageType === 'string' ? payload.messageType : undefined,
          timestamp: entry.timestamp,
          timeLabel: new Date(entry.timestamp).toLocaleTimeString(),
          status
        })
        if (messageId) {
          messageIndexById.set(messageId, mapped.length - 1)
        }
        continue
      }

      if (entry.type === 'messageReceived') {
        const payload = isObjectPayload(entry.payload) ? entry.payload : undefined
        mapped.push({
          id: entry.id,
          sessionId:
            typeof payload?.sessionId === 'string' ? payload.sessionId : selectedSessionId.value,
          messageId: typeof payload?.messageId === 'string' ? payload.messageId : undefined,
          direction: 'incoming',
          text: normalizePayloadToText(payload?.payload),
          messageType: typeof payload?.messageType === 'string' ? payload.messageType : undefined,
          timestamp: entry.timestamp,
          timeLabel: new Date(entry.timestamp).toLocaleTimeString(),
          status: 'received'
        })
        continue
      }

      if (entry.type === 'messageAck') {
        const payload = isObjectPayload(entry.payload) ? entry.payload : undefined
        const messageId = typeof payload?.messageId === 'string' ? payload.messageId : undefined
        if (messageId && messageIndexById.has(messageId)) {
          const targetIndex = messageIndexById.get(messageId)
          if (typeof targetIndex === 'number') {
            mapped[targetIndex] = {
              ...mapped[targetIndex],
              status: 'acked'
            }
          }
          continue
        }
      }

      if (entry.type === 'transportError') {
        const payload = isObjectPayload(entry.payload) ? entry.payload : undefined
        mapped.push({
          id: entry.id,
          direction: 'system',
          text:
            typeof payload?.message === 'string' ? payload.message : 'Transport error occurred.',
          timestamp: entry.timestamp,
          timeLabel: new Date(entry.timestamp).toLocaleTimeString(),
          status: 'system'
        })
      }
    }

    for (const pending of pendingMessages.value) {
      mapped.push(pending)
    }

    return mapped.sort((left, right) => left.timestamp - right.timestamp)
  })

  const canSend = computed(
    () => canSendBySession.value && !sending.value && messageInput.value.trim().length > 0
  )

  const error = computed(() => localError.value ?? discoveryError.value)

  const devices = computed<ChatDevice[]>(() => {
    const sessionByDeviceId = new Map(
      activeSessions.value
        .filter((item) => typeof item.deviceId === 'string' && item.deviceId.length > 0)
        .map((item) => [item.deviceId as string, item])
    )

    return rawDevices.value
      .map((device) => {
        const linkedSession = sessionByDeviceId.get(device.deviceId)
        return {
          deviceId: device.deviceId,
          name:
            typeof device.name === 'string' && device.name.length > 0
              ? device.name
              : device.deviceId,
          ipAddress: typeof device.ipAddress === 'string' ? device.ipAddress : undefined,
          source: typeof device.source === 'string' ? device.source : undefined,
          connectable: Boolean(device.connectable),
          connectCheckError:
            typeof device.connectCheckError === 'string' ? device.connectCheckError : undefined,
          lastSeenAt: typeof device.lastSeenAt === 'number' ? device.lastSeenAt : undefined,
          lastSeenLabel:
            typeof device.lastSeenAt === 'number'
              ? new Date(device.lastSeenAt).toLocaleTimeString()
              : 'unknown',
          sessionId: linkedSession?.sessionId,
          sessionStatus: linkedSession?.status,
          isSelected: selectedDeviceId.value === device.deviceId
        }
      })
      .sort((left, right) => (right.lastSeenAt ?? 0) - (left.lastSeenAt ?? 0))
  })

  const selectedDeviceLabel = computed(
    () => selectedDevice.value?.name ?? selectedSession.value?.deviceId ?? 'Choose device'
  )

  watch(messageEvents, (entries) => {
    if (entries.length === 0 || pendingMessages.value.length === 0) {
      return
    }
    const sentMessageIds = new Set<string>()
    for (const entry of entries) {
      if (entry.type !== 'messageSent') {
        continue
      }
      const payload = isObjectPayload(entry.payload) ? entry.payload : undefined
      if (typeof payload?.messageId === 'string' && payload.messageId.length > 0) {
        sentMessageIds.add(payload.messageId)
      }
    }
    pendingMessages.value = pendingMessages.value.filter((message) => {
      if (!message.messageId) {
        return false
      }
      return !sentMessageIds.has(message.messageId)
    })
  })

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

  async function connectSelectedDevice(): Promise<void> {
    if (!selectedDevice.value || loading.value || !selectedDevice.value.connectable) {
      return
    }
    if (!selectedDevice.value.ipAddress) {
      localError.value = 'Selected device has no valid IP address.'
      return
    }
    localError.value = null
    await openSessionByDevice({
      deviceId: selectedDevice.value.deviceId,
      host: selectedDevice.value.ipAddress,
      port: DEFAULT_SOCKET_PORT
    })
    await syncSessionState()
    const linkedSession = activeSessions.value.find(
      (session) => session.deviceId === selectedDevice.value?.deviceId && session.status === 'open'
    )
    if (linkedSession?.sessionId) {
      selectedSessionId.value = linkedSession.sessionId
    }
  }

  async function disconnectSelectedSession(): Promise<void> {
    if (!selectedSession.value) {
      return
    }
    await closeSession(selectedSession.value.sessionId)
    selectedSessionId.value = ''
  }

  async function reconnectSelectedDevice(): Promise<void> {
    if (!selectedDevice.value?.ipAddress) {
      return
    }
    await reconnectDevice({
      deviceId: selectedDevice.value.deviceId,
      host: selectedDevice.value.ipAddress,
      port: DEFAULT_SOCKET_PORT
    })
    await syncSessionState()
  }

  async function refreshDeviceDiscovery(): Promise<void> {
    await refreshDevices()
  }

  async function onSendMessage(): Promise<void> {
    if (!canSend.value || !selectedSession.value) {
      return
    }

    const content = messageInput.value.trim()
    const optimisticMessageId = `local-${Date.now()}-${Math.random().toString(16).slice(2)}`
    pendingMessages.value.push({
      id: optimisticMessageId,
      sessionId: selectedSession.value.sessionId,
      messageId: optimisticMessageId,
      direction: 'outgoing',
      text: content,
      messageType: messageType.value,
      timestamp: Date.now(),
      timeLabel: new Date().toLocaleTimeString(),
      status: 'sending'
    })
    messageInput.value = ''
    localError.value = null
    sending.value = true
    try {
      await sendMessage({
        sessionId: selectedSession.value.sessionId,
        messageType: messageType.value,
        payload: content,
        messageId: optimisticMessageId
      })
    } catch (unknownError) {
      failedMessageIds.value = new Set(failedMessageIds.value).add(optimisticMessageId)
      pendingMessages.value = pendingMessages.value.map((message) =>
        message.messageId === optimisticMessageId ? { ...message, status: 'failed' } : message
      )
      localError.value = resolveErrorMessage(unknownError, 'Failed to send message.')
    } finally {
      sending.value = false
    }
  }

  onMounted(async () => {
    await ensureListeners()
    await refreshDevices()
    await startDiscovery()
  })

  return {
    activeSessions,
    canSend,
    connectSelectedDevice,
    devices,
    disconnectSelectedSession,
    error,
    loading,
    messages,
    messageInput,
    messageType,
    onSendMessage,
    openSession,
    reconnectSelectedDevice,
    refreshDeviceDiscovery,
    selectDevice,
    selectedDevice,
    selectedDeviceId,
    selectedDeviceLabel,
    selectedSession,
    selectedSessionId,
    sending,
    sessionLogs
  }
}
