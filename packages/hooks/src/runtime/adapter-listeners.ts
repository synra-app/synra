import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import type { Ref } from 'vue'
import type { RuntimeConnectedSession, RuntimeSessionState } from '../types'
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
import type { LanWireListenersRegistry } from './lan-wire-listeners'
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
  connectedSessions: Ref<RuntimeConnectedSession[]>
  messageRegistry: MessageListenersRegistry
  lanWireRegistry: LanWireListenersRegistry
}): Promise<void> {
  const {
    adapter,
    devices,
    sessionState,
    error,
    sessionsBook,
    connectedSessions,
    messageRegistry,
    lanWireRegistry
  } = options

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

    const inboundWire = event.incomingSynraConnectPayload
    const inboundConnectType =
      inboundWire && typeof inboundWire.connectType === 'string'
        ? inboundWire.connectType.trim().toLowerCase()
        : ''
    if (inferredDirection === 'inbound' && inboundConnectType === 'fresh') {
      const repair = getHooksRuntimeOptions().repairStalePairingAfterInboundFreshConnect
      if (typeof repair === 'function') {
        void Promise.resolve(repair(event)).catch(() => undefined)
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
        transport: 'ready',
        app: 'pending',
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
    const closedOpen = sessionsBook.markTransportDead(event.sessionId, Date.now())
    const closedDeviceId = closedOpen?.deviceId
    if (typeof closedDeviceId === 'string' && closedDeviceId.trim().length > 0) {
      setPairAwaitingAccept(closedDeviceId, false)
      setPairedDeviceConnecting(closedDeviceId, false)
    }
  })

  await adapter.addLanWireEventReceivedListener((event) => {
    sessionsBook.touchSessionActivity(event.sessionId, Date.now(), 'inbound')
    const row = connectedSessions.value.find((s) => s.sessionId === event.sessionId)
    const resolvedFromId = row?.deviceId ?? event.fromDeviceId
    lanWireRegistry.emitLanWireEvent(event, resolvedFromId)
    if (event.eventName === 'device.displayName.changed' && event.eventPayload !== undefined) {
      const pl =
        event.eventPayload && typeof event.eventPayload === 'object'
          ? (event.eventPayload as Record<string, unknown>)
          : {}
      const deviceId = typeof pl.deviceId === 'string' ? pl.deviceId : undefined
      const displayName = typeof pl.displayName === 'string' ? pl.displayName : undefined
      if (deviceId && displayName) {
        applyRemoteDeviceProfileName(devices, deviceId, displayName)
        const patch = getHooksRuntimeOptions().onRemoteDeviceProfile
        if (typeof patch === 'function') {
          patch(deviceId, displayName)
        }
      }
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
      sessionsBook.markTransportDead(transportErrorSessionId, now)
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
        transport: 'ready',
        app: 'pending',
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
