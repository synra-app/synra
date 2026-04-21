import { computed, onMounted, ref } from 'vue'
import type { SessionLogEntry } from '../src/types/chat'
import {
  useConnectionState,
  useDevices,
  useDiscovery,
  useSessionMessages
} from '@synra/plugin-sdk/hooks'
import type { SynraHookSendMessageInput } from '@synra/plugin-sdk/hooks'
import { useChatActiveSessions } from './useChatActiveSessions'
import { useChatDeviceActions } from './useChatDeviceActions'
import { useChatDevicesView } from './useChatDevicesView'
import { useChatMessageProjection } from './useChatMessageProjection'
import { useChatSelection } from './useChatSelection'
import { useChatSendPipeline } from './useChatSendPipeline'

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

  const { activeSessions } = useChatActiveSessions(rawActiveSessions)

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

  const { messages, failedMessageIds, pendingMessages } = useChatMessageProjection({
    selectedSessionId,
    sessionLogs
  })

  const { devices } = useChatDevicesView({
    rawDevices,
    activeSessions,
    selectedDeviceId
  })

  const { selectedDevice, selectedSession, selectedDeviceLabel, openSession, selectDevice } =
    useChatSelection({
      activeSessions,
      rawDevices,
      devices,
      selectedDeviceId,
      selectedSessionId
    })

  const {
    connectSelectedDevice,
    disconnectSelectedSession,
    reconnectSelectedDevice,
    refreshDeviceDiscovery
  } = useChatDeviceActions({
    loading,
    selectedDevice,
    selectedSession,
    activeSessions,
    selectedSessionId,
    openSessionByDevice,
    closeSession,
    reconnectDevice,
    syncSessionState,
    refreshDevices,
    localError
  })

  const { sending, canSend, onSendMessage } = useChatSendPipeline({
    selectedSession,
    canSendBySession,
    messageInput,
    messageType,
    localError,
    sendMessage,
    failedMessageIds,
    pendingMessages
  })

  const error = computed(() => localError.value ?? discoveryError.value)

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
