import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import type { Ref } from 'vue'
import type { RuntimeSessionState } from '../types'
import type { ConnectionRuntimeAdapter } from './adapter'
import type { ConnectedSessionsBook } from './connected-sessions-book'
import type { DesktopHandoffState } from './desktop-handoff'
import { upsertDiscoveredDevice, upsertDiscoveredPeerFromSession } from './discovered-device-upsert'
import { normalizeHost } from './host-normalization'
import { sortDevices } from './device-sort'
import type { MessageListenersRegistry } from './message-listeners'

export async function registerAdapterListeners(options: {
  adapter: ConnectionRuntimeAdapter
  isMobileRuntime: boolean
  devices: Ref<DiscoveredDevice[]>
  sessionState: Ref<RuntimeSessionState>
  error: Ref<string | null>
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
    sessionsBook,
    handoff,
    messageRegistry
  } = options

  const { emitIncomingMessage } = messageRegistry

  await adapter.addDeviceConnectableUpdatedListener((event) => {
    upsertDiscoveredDevice(devices, event.device)
  })

  await adapter.addDeviceLostListener((event) => {
    if (!event.deviceId && !event.ipAddress) {
      return
    }
    const normalizedIp = normalizeHost(event.ipAddress ?? '')
    devices.value = sortDevices(
      devices.value.filter((device) => {
        if (event.deviceId && device.deviceId === event.deviceId) {
          return false
        }
        if (normalizedIp.length > 0 && normalizeHost(device.ipAddress) === normalizedIp) {
          return false
        }
        return true
      })
    )
  })

  await adapter.addSessionOpenedListener((event) => {
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
        port: event.port,
        openedAt: Date.now(),
        lastActiveAt: Date.now(),
        direction: inferredDirection
      },
      { immediate: true }
    )
  })

  await adapter.addSessionClosedListener((event) => {
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
    sessionsBook.touchSessionActivity(event.sessionId, Date.now(), 'inbound')
    emitIncomingMessage(event)
  })

  await adapter.addMessageAckListener((event) => {
    sessionsBook.touchSessionActivity(event.sessionId, Date.now(), 'outbound')
  })

  await adapter.addTransportErrorListener((event) => {
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
        port: snapshot.port,
        openedAt: snapshot.openedAt,
        lastActiveAt: Date.now(),
        direction: 'outbound'
      },
      { immediate: true }
    )
  }
}
