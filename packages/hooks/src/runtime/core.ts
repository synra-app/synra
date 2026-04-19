import type { HostEvent, MessageReceivedEvent } from '@synra/capacitor-device-connection'
import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import { unknownToErrorMessage, type SynraMessageType } from '@synra/protocol'
import { computed, ref, type Ref } from 'vue'
import type {
  SynraConnectionFilter,
  SynraConnectionMessage,
  SynraConnectionRuntimeState,
  SynraConnectionSendInput,
  SynraDiscoveryStartOptions,
  SynraHookConnectedSession,
  SynraHookEventLog,
  SynraHookSessionState
} from '../types'
import type { ConnectionRuntimeAdapter } from './adapter'
import { resolveRuntimeAdapter } from './resolve-adapter'

const MAX_EVENT_LOGS = 200
const MAX_SEEN_EVENT_IDS = 1000

type RuntimeMessageHandler = {
  filter?: SynraConnectionFilter
  handler: (message: SynraConnectionMessage) => void | Promise<void>
}

function sortDevices(devices: DiscoveredDevice[]): DiscoveredDevice[] {
  return [...devices].sort((left, right) => right.lastSeenAt - left.lastSeenAt)
}

function resolveSessionIdFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined
  }
  const value = (payload as { sessionId?: unknown }).sessionId
  return typeof value === 'string' ? value : undefined
}

function resolveMessageEventId(event: {
  type: string
  sessionId?: string
  messageId?: string
  timestamp?: number
}): string {
  return [
    event.type,
    event.sessionId ?? '',
    event.messageId ?? '',
    String(event.timestamp ?? Date.now())
  ].join(':')
}

export type ConnectionRuntime = SynraConnectionRuntimeState & {
  pairedDevices: Readonly<Ref<DiscoveredDevice[]>>
  ensureListeners(): Promise<void>
  startDiscovery(options?: string[] | SynraDiscoveryStartOptions): Promise<void>
  stopDiscovery(): Promise<void>
  refreshDevices(): Promise<void>
  pairDevice(deviceId: string): Promise<void>
  probeConnectable(port?: number, timeoutMs?: number): Promise<void>
  openSession(options: {
    deviceId: string
    host: string
    port: number
    transport?: 'tcp'
  }): Promise<void>
  closeSession(sessionId?: string): Promise<void>
  syncSessionState(sessionId?: string): Promise<void>
  sendMessage(input: SynraConnectionSendInput): Promise<void>
  onMessage(
    handler: (message: SynraConnectionMessage) => void | Promise<void>,
    filter?: SynraConnectionFilter
  ): () => void
}

function createConnectionRuntime(adapter: ConnectionRuntimeAdapter): ConnectionRuntime {
  const scanState = ref('idle')
  const startedAt = ref<number | undefined>(undefined)
  const scanWindowMs = ref(15_000)
  const devices = ref<DiscoveredDevice[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const sessionState = ref<SynraHookSessionState>({
    state: 'idle',
    transport: 'tcp'
  })
  const connectedSessions = ref<SynraHookConnectedSession[]>([])
  const eventLogs = ref<SynraHookEventLog[]>([])
  const listeners = new Set<RuntimeMessageHandler>()
  const seenEventIds = new Set<string>()
  let listenersRegistered = false

  const pairedDevices = computed(() => devices.value.filter((device) => Boolean(device.paired)))

  function appendEventLog(type: SynraHookEventLog['type'], payload: unknown, id?: string): void {
    const eventId = id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
    if (seenEventIds.has(eventId)) {
      return
    }
    seenEventIds.add(eventId)
    if (seenEventIds.size > MAX_SEEN_EVENT_IDS) {
      const first = seenEventIds.values().next().value
      if (typeof first === 'string') {
        seenEventIds.delete(first)
      }
    }
    eventLogs.value.unshift({
      id: eventId,
      type,
      payload,
      timestamp: Date.now()
    })
    if (eventLogs.value.length > MAX_EVENT_LOGS) {
      eventLogs.value.length = MAX_EVENT_LOGS
    }
  }

  function upsertConnectedSession(next: SynraHookConnectedSession): void {
    const index = connectedSessions.value.findIndex((item) => item.sessionId === next.sessionId)
    if (index === -1) {
      connectedSessions.value.unshift(next)
    } else {
      connectedSessions.value[index] = {
        ...connectedSessions.value[index],
        ...next
      }
    }

    connectedSessions.value.sort((left, right) => {
      if (left.status === 'open' && right.status !== 'open') {
        return -1
      }
      if (left.status !== 'open' && right.status === 'open') {
        return 1
      }
      return (right.lastActiveAt ?? 0) - (left.lastActiveAt ?? 0)
    })
  }

  function markConnectionClosed(sessionId: string | undefined, reasonAt: number): void {
    if (!sessionId) {
      return
    }
    const current = connectedSessions.value.find((item) => item.sessionId === sessionId)
    if (!current) {
      return
    }
    upsertConnectedSession({
      ...current,
      status: 'closed',
      closedAt: reasonAt,
      lastActiveAt: reasonAt
    })
  }

  function emitIncomingMessage(event: MessageReceivedEvent, deviceId?: string): void {
    const normalized: SynraConnectionMessage = {
      eventId: resolveMessageEventId({
        type: 'messageReceived',
        sessionId: event.sessionId,
        messageId: event.messageId,
        timestamp: event.timestamp
      }),
      sessionId: event.sessionId,
      messageType: event.messageType,
      payload: event.payload,
      messageId: event.messageId,
      timestamp: event.timestamp,
      deviceId
    }

    for (const listener of listeners) {
      if (listener.filter?.sessionId && listener.filter.sessionId !== normalized.sessionId) {
        continue
      }
      if (listener.filter?.deviceId && listener.filter.deviceId !== normalized.deviceId) {
        continue
      }
      if (listener.filter?.messageType && listener.filter.messageType !== normalized.messageType) {
        continue
      }
      void Promise.resolve(listener.handler(normalized))
    }
  }

  function replayHostEvent(event: HostEvent): void {
    const replayEventId = `host:${event.id}`
    if (event.type === 'transport.message.received' && event.sessionId) {
      appendEventLog('messageReceived', event, replayEventId)
      upsertConnectedSession({
        sessionId: event.sessionId,
        status: 'open',
        lastActiveAt: Date.now()
      })
      emitIncomingMessage(
        {
          sessionId: event.sessionId,
          messageType: (event.messageType ?? 'transport.message.received') as SynraMessageType,
          payload:
            event.payload && typeof event.payload === 'object' && 'payload' in event.payload
              ? (event.payload as { payload: unknown }).payload
              : event.payload,
          messageId: event.messageId,
          timestamp: event.timestamp,
          transport: 'tcp'
        },
        undefined
      )
      return
    }

    if (event.type === 'transport.message.ack' && event.sessionId) {
      appendEventLog('messageAck', event, replayEventId)
      upsertConnectedSession({
        sessionId: event.sessionId,
        status: 'open',
        lastActiveAt: Date.now()
      })
      return
    }

    if (event.type === 'transport.session.opened' && event.sessionId) {
      appendEventLog('sessionOpened', event, replayEventId)
      upsertConnectedSession({
        sessionId: event.sessionId,
        status: 'open',
        remote: event.remote,
        openedAt: event.timestamp,
        lastActiveAt: Date.now()
      })
      return
    }

    if (event.type === 'transport.session.closed') {
      appendEventLog('sessionClosed', event, replayEventId)
      markConnectionClosed(event.sessionId, Date.now())
      return
    }

    if (event.type === 'transport.error') {
      appendEventLog('transportError', event, replayEventId)
      if (typeof event.payload === 'string') {
        error.value = event.payload
      }
    }
  }

  async function refreshDevices(): Promise<void> {
    try {
      const result = await adapter.getDiscoveredDevices()
      scanState.value = result.state
      startedAt.value = result.startedAt
      scanWindowMs.value = result.scanWindowMs
      devices.value = sortDevices(result.devices)
      await probeConnectable()
      error.value = null
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, 'Failed to load devices.')
    }
  }

  async function startDiscovery(
    options: string[] | SynraDiscoveryStartOptions = []
  ): Promise<void> {
    loading.value = true
    try {
      const normalizedOptions: SynraDiscoveryStartOptions = Array.isArray(options)
        ? {
            manualTargets: options
          }
        : options
      const result = await adapter.startDiscovery({
        discoveryMode: 'hybrid',
        includeLoopback: false,
        enableProbeFallback: true,
        ...normalizedOptions
      })
      scanState.value = result.state
      startedAt.value = result.startedAt
      scanWindowMs.value = result.scanWindowMs
      devices.value = sortDevices(result.devices)
      await probeConnectable()
      error.value = null
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, 'Failed to start discovery.')
    } finally {
      loading.value = false
    }
  }

  async function stopDiscovery(): Promise<void> {
    loading.value = true
    try {
      await adapter.stopDiscovery()
      scanState.value = 'idle'
      error.value = null
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, 'Failed to stop discovery.')
    } finally {
      loading.value = false
    }
  }

  async function pairDevice(deviceId: string): Promise<void> {
    loading.value = true
    try {
      const result = await adapter.pairDevice(deviceId)
      devices.value = sortDevices(
        devices.value.map((device) => (device.deviceId === deviceId ? result.device : device))
      )
      error.value = null
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, 'Failed to pair device.')
    } finally {
      loading.value = false
    }
  }

  async function probeConnectable(port = 32100, timeoutMs = 1500): Promise<void> {
    try {
      const result = await adapter.probeConnectable(port, timeoutMs)
      devices.value = sortDevices(result.devices)
      error.value = null
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, 'Failed to probe device connectability.')
    }
  }

  async function openSession(options: {
    deviceId: string
    host: string
    port: number
    transport?: 'tcp'
  }): Promise<void> {
    loading.value = true
    try {
      const result = await adapter.openSession(options)
      sessionState.value = {
        sessionId: result.sessionId,
        deviceId: options.deviceId,
        host: options.host,
        port: options.port,
        state: result.state,
        transport: result.transport
      }
      upsertConnectedSession({
        sessionId: result.sessionId,
        status: 'open',
        deviceId: options.deviceId,
        host: options.host,
        remote: options.host,
        port: options.port,
        openedAt: Date.now(),
        lastActiveAt: Date.now(),
        direction: 'outbound'
      })
      error.value = null
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, 'Failed to open session.')
    } finally {
      loading.value = false
    }
  }

  async function closeSession(sessionId?: string): Promise<void> {
    loading.value = true
    try {
      await adapter.closeSession(sessionId)
      sessionState.value = {
        ...sessionState.value,
        sessionId,
        state: 'closed',
        closedAt: Date.now()
      }
      markConnectionClosed(sessionId, Date.now())
      error.value = null
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, 'Failed to close session.')
    } finally {
      loading.value = false
    }
  }

  async function sendMessage(input: SynraConnectionSendInput): Promise<void> {
    loading.value = true
    try {
      appendEventLog(
        'messageSent',
        {
          sessionId: input.sessionId,
          messageId: input.messageId,
          messageType: input.messageType,
          payload: input.payload,
          deviceId: input.deviceId
        },
        resolveMessageEventId({
          type: 'messageSent',
          sessionId: input.sessionId,
          messageId: input.messageId,
          timestamp: Date.now()
        })
      )
      upsertConnectedSession({
        sessionId: input.sessionId,
        status: 'open',
        lastActiveAt: Date.now(),
        direction:
          connectedSessions.value.find((item) => item.sessionId === input.sessionId)?.direction ??
          'outbound'
      })
      await adapter.sendMessage({
        sessionId: input.sessionId,
        messageId: input.messageId,
        messageType: input.messageType,
        payload: input.payload
      })
      error.value = null
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, 'Failed to send message.')
      throw unknownError
    } finally {
      loading.value = false
    }
  }

  async function syncSessionState(sessionId?: string): Promise<void> {
    try {
      const snapshot = await adapter.getSessionState(sessionId)
      sessionState.value = snapshot
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, 'Failed to sync session state.')
    }
  }

  async function ensureListeners(): Promise<void> {
    if (listenersRegistered) {
      return
    }

    await adapter.addDeviceConnectableUpdatedListener((event) => {
      devices.value = sortDevices(
        devices.value.map((device) =>
          device.deviceId === event.device.deviceId ? event.device : device
        )
      )
    })

    await adapter.addSessionOpenedListener((event) => {
      appendEventLog('sessionOpened', event)
      sessionState.value = {
        ...sessionState.value,
        sessionId: event.sessionId,
        deviceId: event.deviceId,
        host: event.host,
        port: event.port,
        state: 'open',
        openedAt: Date.now()
      }
      upsertConnectedSession({
        sessionId: event.sessionId,
        status: 'open',
        deviceId: event.deviceId,
        host: event.host,
        remote: event.host,
        port: event.port,
        openedAt: Date.now(),
        lastActiveAt: Date.now(),
        direction: 'outbound'
      })
    })

    await adapter.addSessionClosedListener((event) => {
      appendEventLog('sessionClosed', event)
      sessionState.value = {
        ...sessionState.value,
        state: 'closed',
        closedAt: Date.now()
      }
      markConnectionClosed(event.sessionId, Date.now())
    })

    await adapter.addMessageReceivedListener((event) => {
      appendEventLog(
        'messageReceived',
        event,
        resolveMessageEventId({
          type: 'messageReceived',
          sessionId: event.sessionId,
          messageId: event.messageId,
          timestamp: event.timestamp
        })
      )
      upsertConnectedSession({
        sessionId: event.sessionId,
        status: 'open',
        lastActiveAt: Date.now(),
        direction:
          connectedSessions.value.find((item) => item.sessionId === event.sessionId)?.direction ??
          'inbound'
      })
      emitIncomingMessage(event)
    })

    await adapter.addMessageAckListener((event) => {
      appendEventLog(
        'messageAck',
        event,
        resolveMessageEventId({
          type: 'messageAck',
          sessionId: event.sessionId,
          messageId: event.messageId,
          timestamp: event.timestamp
        })
      )
      upsertConnectedSession({
        sessionId: event.sessionId,
        status: 'open',
        lastActiveAt: Date.now(),
        direction:
          connectedSessions.value.find((item) => item.sessionId === event.sessionId)?.direction ??
          'outbound'
      })
    })

    await adapter.addTransportErrorListener((event) => {
      appendEventLog('transportError', event)
      error.value = event.message
    })

    const hostReplay = await adapter.pullHostEvents()
    for (const hostEvent of hostReplay.events) {
      replayHostEvent(hostEvent)
    }

    const snapshot = await adapter.getSessionState()
    sessionState.value = snapshot
    if (snapshot.state === 'open' && snapshot.sessionId) {
      upsertConnectedSession({
        sessionId: snapshot.sessionId,
        status: 'open',
        deviceId: snapshot.deviceId,
        host: snapshot.host,
        remote: snapshot.host,
        port: snapshot.port,
        openedAt: snapshot.openedAt,
        lastActiveAt: Date.now(),
        direction: 'outbound'
      })
    }

    listenersRegistered = true
  }

  function onMessage(
    handler: (message: SynraConnectionMessage) => void | Promise<void>,
    filter?: SynraConnectionFilter
  ): () => void {
    const entry: RuntimeMessageHandler = {
      handler,
      filter
    }
    listeners.add(entry)
    return () => {
      listeners.delete(entry)
    }
  }

  return {
    scanState,
    startedAt,
    scanWindowMs,
    devices,
    pairedDevices,
    loading,
    error,
    sessionState,
    connectedSessions,
    eventLogs,
    ensureListeners,
    startDiscovery,
    stopDiscovery,
    refreshDevices,
    pairDevice,
    probeConnectable,
    openSession,
    closeSession,
    syncSessionState,
    sendMessage,
    onMessage
  }
}

let runtimeSingleton: ConnectionRuntime | null = null

export function getConnectionRuntime(): ConnectionRuntime {
  if (!runtimeSingleton) {
    runtimeSingleton = createConnectionRuntime(resolveRuntimeAdapter())
  }
  return runtimeSingleton
}

export function resetConnectionRuntime(): void {
  runtimeSingleton = null
}

export function resolveSessionIdFromLogPayload(payload: unknown): string | undefined {
  return resolveSessionIdFromPayload(payload)
}
