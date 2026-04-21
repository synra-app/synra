import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import type { Ref } from 'vue'
import type { SynraHookEventLog, SynraHookSessionState } from '../types'
import type { ConnectionRuntimeAdapter } from './adapter'
import type { ConnectedSessionsBook } from './connected-sessions-book'
import type { DesktopHandoffState } from './desktop-handoff'
import { sortDevices } from './device-sort'
import { resolveMessageEventId } from './message-event-id'
import type { MessageListenersRegistry } from './message-listeners'

type SessionOpenedLike = {
  deviceId?: string
  host?: string
  displayName?: string
  port?: number
}

function normalizeHost(value: string): string {
  return value.trim().toLowerCase()
}

function nonEmptyTrimmed(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function resolveValidPort(
  eventPort: number | undefined,
  fallbackPort: number | undefined
): number | undefined {
  if (typeof eventPort === 'number' && eventPort > 0) {
    return eventPort
  }
  return fallbackPort
}

function upsertDiscoveredPeerFromSession(
  devices: Ref<DiscoveredDevice[]>,
  event: SessionOpenedLike
): void {
  if (typeof event.deviceId !== 'string' || event.deviceId.length === 0) {
    return
  }
  if (typeof event.host !== 'string' || event.host.length === 0) {
    return
  }
  const host = normalizeHost(event.host)
  if (host.length === 0) {
    return
  }
  const now = Date.now()
  const existing =
    devices.value.find((device) => device.deviceId === event.deviceId) ??
    devices.value.find((device) => normalizeHost(device.ipAddress) === host)
  const existingName = nonEmptyTrimmed(existing?.name)
  const eventDisplayName = nonEmptyTrimmed(event.displayName)
  const displayName = existingName ?? eventDisplayName ?? `Peer ${event.deviceId.slice(0, 8)}`
  const port = resolveValidPort(event.port, existing?.port)
  const peer: DiscoveredDevice = existing
    ? {
        ...existing,
        name: displayName,
        ipAddress: existing.ipAddress || host,
        port,
        source: existing.source,
        connectable: true,
        connectCheckAt: now,
        lastSeenAt: now
      }
    : {
        deviceId: event.deviceId,
        name: displayName,
        ipAddress: host,
        port,
        source: 'session',
        connectable: true,
        connectCheckAt: now,
        discoveredAt: now,
        lastSeenAt: now
      }
  const others = devices.value.filter((device) => {
    if (device.deviceId === peer.deviceId) {
      return false
    }
    return normalizeHost(device.ipAddress) !== host
  })
  devices.value = sortDevices([...others, peer])
}

export async function registerAdapterListeners(options: {
  adapter: ConnectionRuntimeAdapter
  isMobileRuntime: boolean
  devices: Ref<DiscoveredDevice[]>
  sessionState: Ref<SynraHookSessionState>
  error: Ref<string | null>
  appendEventLog: (type: SynraHookEventLog['type'], payload: unknown, id?: string) => boolean
  sessionsBook: ConnectedSessionsBook
  handoff: DesktopHandoffState
  messageRegistry: MessageListenersRegistry
}): Promise<void> {
  const {
    adapter,
    isMobileRuntime,
    devices,
    sessionState,
    error,
    appendEventLog,
    sessionsBook,
    handoff,
    messageRegistry
  } = options

  const { emitIncomingMessage } = messageRegistry

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

    upsertDiscoveredPeerFromSession(devices, event)

    if (!isMobileRuntime && inferredDirection === 'outbound' && event.host) {
      if (handoff.pendingHandoffHosts.has(event.host)) {
        handoff.handoffOutboundSessionIdByHost.set(event.host, event.sessionId)
        return
      }
    }

    if (!isMobileRuntime && inferredDirection === 'inbound' && event.host) {
      handoff.pendingHandoffHosts.delete(event.host)
      const handoffSessionId = handoff.handoffOutboundSessionIdByHost.get(event.host)
      if (handoffSessionId && handoffSessionId !== event.sessionId) {
        handoff.handoffOutboundSessionIdByHost.delete(event.host)
        sessionsBook.markConnectionClosed(handoffSessionId, Date.now())
        void adapter.closeSession(handoffSessionId).catch(() => undefined)
      }
      const staleOutboundSessionIds = sessionsBook.findOpenSessionIdsByHostDirection(
        event.host,
        'outbound',
        event.sessionId
      )
      for (const staleSessionId of staleOutboundSessionIds) {
        sessionsBook.markConnectionClosed(staleSessionId, Date.now())
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
    sessionsBook.upsertConnectedSession(
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
      for (const [host, handoffSessionId] of handoff.handoffOutboundSessionIdByHost.entries()) {
        if (handoffSessionId === event.sessionId) {
          handoff.handoffOutboundSessionIdByHost.delete(host)
          handoff.pendingHandoffHosts.delete(host)
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
    sessionsBook.markConnectionClosed(event.sessionId, Date.now())
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
    sessionsBook.touchSessionActivity(event.sessionId, Date.now(), 'inbound')
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
    sessionsBook.touchSessionActivity(event.sessionId, Date.now(), 'outbound')
  })

  await adapter.addTransportErrorListener((event) => {
    appendEventLog('transportError', event)
    error.value = event.message
  })

  const snapshot = await adapter.getSessionState()
  sessionState.value = snapshot
  if (snapshot.state === 'open' && snapshot.sessionId) {
    sessionsBook.upsertConnectedSession(
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
}
