import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import type { Ref } from 'vue'
import type { RuntimeSessionState } from '../types'
import type { ConnectionRuntimeAdapter } from './adapter'
import type { ConnectedSessionsBook } from './connected-sessions-book'
import {
  applyRemoteDeviceProfileName,
  upsertDiscoveredDevice,
  upsertDiscoveredPeerFromSession
} from './discovered-device-upsert'
import {
  DEVICE_PROFILE_UPDATED_MESSAGE_TYPE,
  isDeviceProfileUpdatedPayload
} from './device-profile'
import { normalizeHost } from './host-normalization'
import { sortDevices } from './device-sort'
import type { MessageListenersRegistry } from './message-listeners'
import { getHooksRuntimeOptions, isLocalDiscoveryDeviceId } from './config'
import { setPairAwaitingAccept } from './pair-awaiting-accept'
import { setPairedDeviceConnecting } from './paired-link-phases'
import { setSessionStateWithTransitionLog } from './session-state-transition-log'

function shouldSuppressTransportErrorMessage(message: string | undefined): boolean {
  if (typeof message !== 'string' || message.length === 0) {
    return false
  }
  const normalized = message.toLowerCase()
  return normalized.includes('econnrefused')
}

export async function registerAdapterListeners(options: {
  adapter: ConnectionRuntimeAdapter
  isMobileRuntime: boolean
  devices: Ref<DiscoveredDevice[]>
  sessionState: Ref<RuntimeSessionState>
  error: Ref<string | null>
  sessionsBook: ConnectedSessionsBook
  messageRegistry: MessageListenersRegistry
}): Promise<void> {
  const { adapter, isMobileRuntime, devices, sessionState, error, sessionsBook, messageRegistry } =
    options

  const { emitIncomingMessage } = messageRegistry

  await adapter.addDeviceConnectableUpdatedListener((event) => {
    if (isLocalDiscoveryDeviceId(event.device.deviceId)) {
      devices.value = sortDevices(
        devices.value.filter((device) => device.deviceId !== event.device.deviceId)
      )
      return
    }
    const exclude = getHooksRuntimeOptions().shouldExcludeDiscoveredDevice
    if (typeof exclude === 'function' && exclude(event.device.deviceId)) {
      devices.value = sortDevices(
        devices.value.filter((device) => device.deviceId !== event.device.deviceId)
      )
      return
    }
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

    if (!isMobileRuntime && inferredDirection === 'inbound' && event.host) {
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
      setSessionStateWithTransitionLog(
        sessionState,
        {
          ...sessionState.value,
          sessionId: event.sessionId,
          deviceId: event.deviceId,
          host: event.host,
          port: event.port,
          direction: inferredDirection,
          state: 'open',
          openedAt: Date.now()
        },
        { reason: 'session_opened_event' }
      )
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

    const pairedFromEvent = (event as { pairedPeerDeviceIds?: unknown }).pairedPeerDeviceIds
    const rawHandshakeKind = (event as { handshakeKind?: unknown }).handshakeKind
    const handshakeKind =
      rawHandshakeKind === 'paired' || rawHandshakeKind === 'fresh' ? rawHandshakeKind : undefined
    const claimsPeerPairedRaw = (event as { claimsPeerPaired?: unknown }).claimsPeerPaired
    const claimsPeerPaired =
      typeof claimsPeerPairedRaw === 'boolean' ? claimsPeerPairedRaw : undefined
    const sync = getHooksRuntimeOptions().onHandshakePairedPeerIds
    if (
      typeof sync === 'function' &&
      typeof event.deviceId === 'string' &&
      event.deviceId.length > 0 &&
      (Array.isArray(pairedFromEvent) ||
        handshakeKind !== undefined ||
        claimsPeerPaired !== undefined)
    ) {
      const ids = Array.isArray(pairedFromEvent)
        ? pairedFromEvent.filter(
            (id): id is string => typeof id === 'string' && id.trim().length > 0
          )
        : []
      sync(event.deviceId, ids, {
        sessionId: typeof event.sessionId === 'string' ? event.sessionId : undefined,
        handshakeKind,
        claimsPeerPaired
      })
    }
  })

  await adapter.addSessionClosedListener((event) => {
    const currentSessionId = sessionState.value.sessionId
    const shouldAffectPrimarySession =
      !currentSessionId || !event.sessionId || currentSessionId === event.sessionId
    if (shouldAffectPrimarySession) {
      const shouldClearCurrentSession = !currentSessionId || currentSessionId === event.sessionId
      setSessionStateWithTransitionLog(
        sessionState,
        shouldClearCurrentSession
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
            },
        { reason: 'session_closed_event' }
      )
    }
    const closedOpen = sessionsBook.markConnectionClosed(event.sessionId, Date.now())
    const closedDeviceId = closedOpen?.deviceId
    if (typeof closedDeviceId === 'string' && closedDeviceId.trim().length > 0) {
      setPairAwaitingAccept(closedDeviceId, false)
      setPairedDeviceConnecting(closedDeviceId, false)
    }
  })

  await adapter.addMessageReceivedListener((event) => {
    sessionsBook.touchSessionActivity(event.sessionId, Date.now(), 'inbound')
    if (
      event.messageType === DEVICE_PROFILE_UPDATED_MESSAGE_TYPE &&
      isDeviceProfileUpdatedPayload(event.payload)
    ) {
      applyRemoteDeviceProfileName(devices, event.payload.deviceId, event.payload.displayName)
      const patch = getHooksRuntimeOptions().onRemoteDeviceProfile
      if (typeof patch === 'function') {
        patch(event.payload.deviceId, event.payload.displayName)
      }
    }
    emitIncomingMessage(event)
  })

  await adapter.addMessageAckListener((event) => {
    sessionsBook.touchSessionActivity(event.sessionId, Date.now(), 'outbound')
  })

  await adapter.addTransportErrorListener((event) => {
    const now = Date.now()
    const transportErrorSessionId =
      typeof event.sessionId === 'string' && event.sessionId.length > 0
        ? event.sessionId
        : undefined
    if (transportErrorSessionId) {
      const currentSessionId = sessionState.value.sessionId
      const shouldAffectPrimarySession =
        !currentSessionId || currentSessionId === transportErrorSessionId
      if (shouldAffectPrimarySession) {
        const shouldClearCurrentSession =
          !currentSessionId || currentSessionId === transportErrorSessionId
        setSessionStateWithTransitionLog(
          sessionState,
          shouldClearCurrentSession
            ? {
                ...sessionState.value,
                sessionId: undefined,
                deviceId: undefined,
                host: undefined,
                port: undefined,
                state: 'closed',
                closedAt: now
              }
            : {
                ...sessionState.value,
                state: 'closed',
                closedAt: now
              },
          { reason: 'transport_error_event' }
        )
      }
      sessionsBook.markConnectionClosed(transportErrorSessionId, now)
    }
    if (shouldSuppressTransportErrorMessage(event.message)) {
      return
    }
    error.value = event.message
  })

  const snapshot = await adapter.getSessionState()
  setSessionStateWithTransitionLog(sessionState, snapshot, { reason: 'adapter_snapshot' })
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
