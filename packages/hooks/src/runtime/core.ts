import type { MessageReceivedEvent } from '@synra/capacitor-device-connection'
import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import { unknownToErrorMessage } from '@synra/protocol'
import { ref, type Ref } from 'vue'
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
const MAX_CLOSED_CONNECTED_SESSIONS = 100
const CONNECTED_SESSIONS_REBUILD_DEBOUNCE_MS = 200

type RuntimeMessageHandler = {
  filter?: SynraConnectionFilter
  handler: (message: SynraConnectionMessage) => void | Promise<void>
}

type ReconnectTask = {
  id: string
  deviceId: string
  host: string
  port: number
  status: 'idle' | 'running' | 'failed' | 'success'
  attempts: number
  updatedAt: number
  error?: string
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
  reconnectTasks: Readonly<Ref<ReconnectTask[]>>
  ensureListeners(): Promise<void>
  startDiscovery(options?: string[] | SynraDiscoveryStartOptions): Promise<void>
  stopDiscovery(): Promise<void>
  refreshDevices(): Promise<void>
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
  reconnectDevice(options: { deviceId: string; host: string; port: number }): Promise<void>
  onMessage(
    handler: (message: SynraConnectionMessage) => void | Promise<void>,
    filter?: SynraConnectionFilter
  ): () => void
}

function createConnectionRuntime(adapter: ConnectionRuntimeAdapter): ConnectionRuntime {
  const runtimePlatform = (
    globalThis as {
      Capacitor?: {
        getPlatform?: () => string
      }
    }
  ).Capacitor?.getPlatform?.()
  const isMobileRuntime = runtimePlatform === 'android' || runtimePlatform === 'ios'
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
  const connectedSessionMap = new Map<string, SynraHookConnectedSession>()
  const eventLogs = ref<SynraHookEventLog[]>([])
  const reconnectTasks = ref<ReconnectTask[]>([])
  const reconnectLocks = new Set<string>()
  const listeners = new Set<RuntimeMessageHandler>()
  const seenEventIds = new Set<string>()
  const pendingHandoffHosts = new Set<string>()
  const handoffOutboundSessionIdByHost = new Map<string, string>()
  let openSessionInFlight = false
  let listenersRegistered = false
  let connectedSessionsRebuildTimer: ReturnType<typeof setTimeout> | undefined

  function appendEventLog(type: SynraHookEventLog['type'], payload: unknown, id?: string): boolean {
    const eventId = id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
    if (seenEventIds.has(eventId)) {
      return false
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
    return true
  }

  function sessionSortValue(session: SynraHookConnectedSession): number {
    return Number(session.lastActiveAt ?? session.closedAt ?? session.openedAt ?? 0)
  }

  function pruneClosedSessions(entries: SynraHookConnectedSession[]): SynraHookConnectedSession[] {
    if (entries.length <= MAX_CLOSED_CONNECTED_SESSIONS) {
      return entries
    }
    return entries.slice(0, MAX_CLOSED_CONNECTED_SESSIONS)
  }

  function rebuildConnectedSessionsView(): void {
    const openSessions: SynraHookConnectedSession[] = []
    const closedSessions: SynraHookConnectedSession[] = []

    for (const item of connectedSessionMap.values()) {
      if (item.status === 'open') {
        openSessions.push(item)
      } else {
        closedSessions.push(item)
      }
    }

    openSessions.sort((left, right) => sessionSortValue(right) - sessionSortValue(left))
    closedSessions.sort((left, right) => sessionSortValue(right) - sessionSortValue(left))
    const retainedClosedSessions = pruneClosedSessions(closedSessions)
    const nextView = [...openSessions, ...retainedClosedSessions]

    connectedSessions.value = nextView

    const retainedIds = new Set(nextView.map((item) => item.sessionId))
    for (const sessionId of connectedSessionMap.keys()) {
      if (!retainedIds.has(sessionId)) {
        connectedSessionMap.delete(sessionId)
      }
    }
  }

  function scheduleConnectedSessionsRebuild(immediate = false): void {
    if (immediate) {
      if (connectedSessionsRebuildTimer) {
        clearTimeout(connectedSessionsRebuildTimer)
        connectedSessionsRebuildTimer = undefined
      }
      rebuildConnectedSessionsView()
      return
    }

    if (connectedSessionsRebuildTimer) {
      return
    }

    connectedSessionsRebuildTimer = setTimeout(() => {
      connectedSessionsRebuildTimer = undefined
      rebuildConnectedSessionsView()
    }, CONNECTED_SESSIONS_REBUILD_DEBOUNCE_MS)
  }

  function upsertConnectedSession(
    next: SynraHookConnectedSession,
    options: { immediate?: boolean } = {}
  ): void {
    const current = connectedSessionMap.get(next.sessionId)
    connectedSessionMap.set(
      next.sessionId,
      current
        ? {
            ...current,
            ...next
          }
        : next
    )
    scheduleConnectedSessionsRebuild(Boolean(options.immediate))
  }

  function markConnectionClosed(sessionId: string | undefined, reasonAt: number): void {
    if (!sessionId) {
      return
    }
    const current = connectedSessionMap.get(sessionId)
    if (!current) {
      return
    }
    upsertConnectedSession(
      {
        ...current,
        status: 'closed',
        closedAt: reasonAt,
        lastActiveAt: reasonAt
      },
      { immediate: true }
    )
  }

  function touchSessionActivity(
    sessionId: string,
    updatedAt: number,
    fallbackDirection: 'inbound' | 'outbound'
  ): void {
    const existing = connectedSessionMap.get(sessionId)
    if (!existing) {
      return
    }
    upsertConnectedSession({
      ...existing,
      status: 'open',
      lastActiveAt: updatedAt,
      direction: existing.direction ?? fallbackDirection
    })
  }

  function findOpenSessionIdsByHostDirection(
    host: string,
    direction: 'inbound' | 'outbound',
    excludeSessionId?: string
  ): string[] {
    const matched: string[] = []
    for (const session of connectedSessionMap.values()) {
      if (session.status !== 'open') {
        continue
      }
      if (excludeSessionId && session.sessionId === excludeSessionId) {
        continue
      }
      const sessionHost = typeof session.host === 'string' ? session.host : undefined
      const sessionDirection = session.direction === 'inbound' ? 'inbound' : 'outbound'
      if (sessionHost === host && sessionDirection === direction) {
        matched.push(session.sessionId)
      }
    }
    return matched
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

  async function refreshDevices(): Promise<void> {
    try {
      const result = await adapter.getDiscoveredDevices()
      scanState.value = result.state
      startedAt.value = result.startedAt
      scanWindowMs.value = result.scanWindowMs
      devices.value = sortDevices(result.devices)
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
    if (openSessionInFlight) {
      return
    }
    openSessionInFlight = true
    loading.value = true
    try {
      if (!isMobileRuntime && options.host) {
        // On desktop, "connect" means finishing mobile->PC reverse link (chain B).
        // The initial PC->mobile channel (chain A) is only a handoff signal.
        pendingHandoffHosts.add(options.host)
      }
      await adapter.openSession(options)
      error.value = null
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, 'Failed to open session.')
      throw unknownError
    } finally {
      openSessionInFlight = false
      loading.value = false
    }
  }

  async function closeSession(sessionId?: string): Promise<void> {
    loading.value = true
    try {
      await adapter.closeSession(sessionId)
      const shouldClearCurrentSession =
        !sessionState.value.sessionId || !sessionId || sessionState.value.sessionId === sessionId
      sessionState.value = {
        ...sessionState.value,
        sessionId: shouldClearCurrentSession ? undefined : sessionState.value.sessionId,
        deviceId: shouldClearCurrentSession ? undefined : sessionState.value.deviceId,
        host: shouldClearCurrentSession ? undefined : sessionState.value.host,
        port: shouldClearCurrentSession ? undefined : sessionState.value.port,
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
      touchSessionActivity(input.sessionId, Date.now(), 'outbound')
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

  async function reconnectDevice(options: {
    deviceId: string
    host: string
    port: number
  }): Promise<void> {
    const taskId = `${options.deviceId}:${options.host}:${options.port}`
    if (reconnectLocks.has(taskId)) {
      return
    }
    reconnectLocks.add(taskId)
    let attempts = 0
    let delayMs = 200
    reconnectTasks.value = [
      {
        id: taskId,
        deviceId: options.deviceId,
        host: options.host,
        port: options.port,
        status: 'running',
        attempts,
        updatedAt: Date.now()
      },
      ...reconnectTasks.value.filter((item) => item.id !== taskId)
    ]
    try {
      while (attempts < 4) {
        attempts += 1
        try {
          await openSession({
            deviceId: options.deviceId,
            host: options.host,
            port: options.port
          })
          reconnectTasks.value = reconnectTasks.value.map((item) =>
            item.id === taskId
              ? { ...item, status: 'success', attempts, updatedAt: Date.now(), error: undefined }
              : item
          )
          return
        } catch (unknownError) {
          const message = unknownToErrorMessage(unknownError, 'Reconnect failed.')
          reconnectTasks.value = reconnectTasks.value.map((item) =>
            item.id === taskId
              ? { ...item, status: 'running', attempts, updatedAt: Date.now(), error: message }
              : item
          )
          await new Promise<void>((resolve) =>
            setTimeout(resolve, delayMs + Math.floor(Math.random() * 100))
          )
          delayMs *= 2
        }
      }
      reconnectTasks.value = reconnectTasks.value.map((item) =>
        item.id === taskId ? { ...item, status: 'failed', attempts, updatedAt: Date.now() } : item
      )
    } finally {
      reconnectLocks.delete(taskId)
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
      const rawDirection = (event as { direction?: unknown }).direction
      const explicitDirection =
        rawDirection === 'inbound' || rawDirection === 'outbound' ? rawDirection : undefined
      const inferredDirection =
        explicitDirection ??
        (typeof event.deviceId === 'string' && event.deviceId.length > 0 ? 'outbound' : 'inbound')

      if (!isMobileRuntime && inferredDirection === 'outbound' && event.host) {
        if (pendingHandoffHosts.has(event.host)) {
          handoffOutboundSessionIdByHost.set(event.host, event.sessionId)
          return
        }
      }

      if (!isMobileRuntime && inferredDirection === 'inbound' && event.host) {
        pendingHandoffHosts.delete(event.host)
        const handoffSessionId = handoffOutboundSessionIdByHost.get(event.host)
        if (handoffSessionId && handoffSessionId !== event.sessionId) {
          handoffOutboundSessionIdByHost.delete(event.host)
          markConnectionClosed(handoffSessionId, Date.now())
          void adapter.closeSession(handoffSessionId).catch(() => undefined)
        }
        const staleOutboundSessionIds = findOpenSessionIdsByHostDirection(
          event.host,
          'outbound',
          event.sessionId
        )
        for (const staleSessionId of staleOutboundSessionIds) {
          markConnectionClosed(staleSessionId, Date.now())
          void adapter.closeSession(staleSessionId).catch(() => undefined)
        }
      }

      const currentSessionId = sessionState.value.sessionId
      const currentDirection = sessionState.value.direction === 'inbound' ? 'inbound' : 'outbound'
      const shouldReplacePrimarySession =
        !currentSessionId ||
        currentSessionId === event.sessionId ||
        inferredDirection === 'inbound' ||
        (inferredDirection === 'outbound' && currentDirection !== 'inbound') ||
        sessionState.value.state !== 'open'
      if (shouldReplacePrimarySession) {
        sessionState.value = {
          ...sessionState.value,
          sessionId: event.sessionId,
          deviceId: event.deviceId,
          host: event.host,
          port: event.port,
          direction: inferredDirection,
          state: 'open',
          openedAt: Date.now()
        }
      }
      upsertConnectedSession(
        {
          sessionId: event.sessionId,
          status: 'open',
          deviceId: event.deviceId,
          host: event.host,
          remote: event.host,
          port: event.port,
          openedAt: Date.now(),
          lastActiveAt: Date.now(),
          direction: inferredDirection
        },
        { immediate: true }
      )
    })

    await adapter.addSessionClosedListener((event) => {
      appendEventLog('sessionClosed', event)
      if (event.sessionId) {
        for (const [host, handoffSessionId] of handoffOutboundSessionIdByHost.entries()) {
          if (handoffSessionId === event.sessionId) {
            handoffOutboundSessionIdByHost.delete(host)
            pendingHandoffHosts.delete(host)
          }
        }
      }
      const currentSessionId = sessionState.value.sessionId
      const shouldAffectPrimarySession =
        !currentSessionId || !event.sessionId || currentSessionId === event.sessionId
      if (shouldAffectPrimarySession) {
        const shouldClearCurrentSession = !currentSessionId || currentSessionId === event.sessionId
        sessionState.value = shouldClearCurrentSession
          ? {
              ...sessionState.value,
              sessionId: undefined,
              deviceId: undefined,
              host: undefined,
              port: undefined,
              state: 'closed',
              closedAt: Date.now()
            }
          : {
              ...sessionState.value,
              state: 'closed',
              closedAt: Date.now()
            }
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
      touchSessionActivity(event.sessionId, Date.now(), 'inbound')
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
      touchSessionActivity(event.sessionId, Date.now(), 'outbound')
    })

    await adapter.addTransportErrorListener((event) => {
      appendEventLog('transportError', event)
      error.value = event.message
    })

    const snapshot = await adapter.getSessionState()
    sessionState.value = snapshot
    if (snapshot.state === 'open' && snapshot.sessionId) {
      upsertConnectedSession(
        {
          sessionId: snapshot.sessionId,
          status: 'open',
          deviceId: snapshot.deviceId,
          host: snapshot.host,
          remote: snapshot.host,
          port: snapshot.port,
          openedAt: snapshot.openedAt,
          lastActiveAt: Date.now(),
          direction: 'outbound'
        },
        { immediate: true }
      )
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
    reconnectTasks,
    loading,
    error,
    sessionState,
    connectedSessions,
    eventLogs,
    ensureListeners,
    startDiscovery,
    stopDiscovery,
    refreshDevices,
    probeConnectable,
    openSession,
    closeSession,
    syncSessionState,
    sendMessage,
    reconnectDevice,
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
