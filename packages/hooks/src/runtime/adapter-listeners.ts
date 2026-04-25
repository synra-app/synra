import { dispatchSynraWireEvent } from '@synra/transport-events'
import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import type { Ref } from 'vue'
import type { RuntimeOpenTransportLink, RuntimePrimaryTransportState } from '../types'
import type { ConnectionRuntimeAdapter } from './adapter'
import type { OpenTransportLinksBook } from './open-transport-links-book'
import {
  applyRemoteDeviceProfileName,
  upsertDiscoveredDevice,
  upsertDiscoveredPeerFromTransportOpened
} from './discovered-device-upsert'
import {
  DEVICE_PROFILE_UPDATED_MESSAGE_TYPE,
  isDeviceProfileUpdatedPayload
} from './device-profile'
import { shouldKeepDiscoveredDevice, shouldKeepDiscoveredDeviceId } from './discovery-admission'
import { normalizeHost } from './host-normalization'
import { sortDevices } from './device-sort'
import type { MessageListenersRegistry } from './message-listeners'
import type { LanWireListenersRegistry } from './lan-wire-listeners'
import { getHooksRuntimeOptions } from './config'
import { setPairAwaitingAccept } from './pair-awaiting-accept'
import { setPairedDeviceConnecting } from './paired-link-phases'
import { setPrimaryTransportStateWithTransitionLog } from './primary-transport-state-transition-log'

function shouldSuppressTransportErrorMessage(message: string | undefined): boolean {
  if (typeof message !== 'string' || message.length === 0) {
    return false
  }
  const normalized = message.toLowerCase()
  return normalized.includes('econnrefused')
}

function removeDeviceByIdentity(
  devices: Ref<DiscoveredDevice[]>,
  identity: { deviceId?: string; ipAddress?: string }
): void {
  const normalizedIp = normalizeHost(identity.ipAddress ?? '')
  devices.value = sortDevices(
    devices.value.filter((device) => {
      if (identity.deviceId && device.deviceId === identity.deviceId) {
        return false
      }
      if (normalizedIp.length > 0 && normalizeHost(device.ipAddress) === normalizedIp) {
        return false
      }
      return true
    })
  )
}

export async function registerAdapterListeners(options: {
  adapter: ConnectionRuntimeAdapter
  isMobileRuntime: boolean
  devices: Ref<DiscoveredDevice[]>
  primaryTransportState: Ref<RuntimePrimaryTransportState>
  error: Ref<string | null>
  openLinksBook: OpenTransportLinksBook
  openTransportLinks: Ref<RuntimeOpenTransportLink[]>
  messageRegistry: MessageListenersRegistry
  lanWireRegistry: LanWireListenersRegistry
}): Promise<void> {
  const {
    adapter,
    devices,
    primaryTransportState,
    error,
    openLinksBook,
    openTransportLinks: _openTransportLinks,
    messageRegistry,
    lanWireRegistry
  } = options

  const { emitIncomingMessage } = messageRegistry

  await adapter.addDeviceConnectableUpdatedListener((event) => {
    if (!shouldKeepDiscoveredDevice(event.device)) {
      removeDeviceByIdentity(devices, {
        deviceId: event.device.deviceId,
        ipAddress: event.device.ipAddress
      })
      return
    }
    upsertDiscoveredDevice(devices, event.device)
  })

  await adapter.addDeviceLostListener((event) => {
    if (!event.deviceId && !event.ipAddress) {
      return
    }
    removeDeviceByIdentity(devices, event)
  })

  await adapter.addTransportOpenedListener((event) => {
    const rawDirection = (event as { direction?: unknown }).direction
    const explicitDirection =
      rawDirection === 'inbound' || rawDirection === 'outbound' ? rawDirection : undefined
    const inferredDirection =
      explicitDirection ??
      (typeof event.deviceId === 'string' && event.deviceId.length > 0 ? 'outbound' : 'inbound')

    const beforeLength = devices.value.length
    upsertDiscoveredPeerFromTransportOpened(devices, event)
    const openedDeviceId = typeof event.deviceId === 'string' ? event.deviceId : ''
    if (openedDeviceId.length > 0 && !shouldKeepDiscoveredDeviceId(openedDeviceId)) {
      removeDeviceByIdentity(devices, { deviceId: openedDeviceId, ipAddress: event.host })
    } else if (devices.value.length !== beforeLength) {
      const inserted =
        openedDeviceId.length > 0
          ? devices.value.find((device) => device.deviceId === openedDeviceId)
          : undefined
      if (inserted && !shouldKeepDiscoveredDevice(inserted)) {
        removeDeviceByIdentity(devices, { deviceId: openedDeviceId, ipAddress: event.host })
      }
    }

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

    const currentDeviceId = primaryTransportState.value.deviceId
    const currentDirection =
      primaryTransportState.value.direction === 'inbound' ? 'inbound' : 'outbound'
    const shouldReplacePrimaryTransport =
      !currentDeviceId ||
      currentDeviceId === event.deviceId ||
      inferredDirection === 'inbound' ||
      (inferredDirection === 'outbound' && currentDirection !== 'inbound') ||
      primaryTransportState.value.state !== 'open'
    if (shouldReplacePrimaryTransport) {
      setPrimaryTransportStateWithTransitionLog(
        primaryTransportState,
        {
          ...primaryTransportState.value,
          deviceId: event.deviceId,
          host: event.host,
          port: event.port,
          direction: inferredDirection,
          state: 'open',
          openedAt: Date.now()
        },
        { reason: 'transport_opened_event' }
      )
    }
    openLinksBook.upsertOpenLink(
      {
        deviceId: event.deviceId ?? '',
        transport: 'ready',
        app: 'pending',
        host: event.host,
        port: event.port,
        openedAt: Date.now(),
        lastActiveAt: Date.now(),
        direction: inferredDirection
      },
      { immediate: true }
    )
  })

  await adapter.addTransportClosedListener((event) => {
    const currentDeviceId = primaryTransportState.value.deviceId
    const shouldAffectPrimaryTransport =
      !currentDeviceId || !event.deviceId || currentDeviceId === event.deviceId
    if (shouldAffectPrimaryTransport) {
      const shouldClearPrimary = !currentDeviceId || currentDeviceId === event.deviceId
      setPrimaryTransportStateWithTransitionLog(
        primaryTransportState,
        shouldClearPrimary
          ? {
              ...primaryTransportState.value,
              deviceId: undefined,
              host: undefined,
              port: undefined,
              state: 'closed',
              closedAt: Date.now()
            }
          : {
              ...primaryTransportState.value,
              state: 'closed',
              closedAt: Date.now()
            },
        { reason: 'transport_closed_event' }
      )
    }
    const closedOpen = openLinksBook.markTransportDead(event.deviceId, Date.now())
    const closedDeviceId = closedOpen?.deviceId
    if (typeof closedDeviceId === 'string' && closedDeviceId.trim().length > 0) {
      setPairAwaitingAccept(closedDeviceId, false)
      setPairedDeviceConnecting(closedDeviceId, false)
    }
  })

  await adapter.addLanWireEventReceivedListener((event) => {
    openLinksBook.touchLinkActivity(event.sourceDeviceId, Date.now(), 'inbound')
    lanWireRegistry.emitLanWireEvent(event, event.sourceDeviceId)
    void dispatchSynraWireEvent({
      eventName: event.eventName,
      requestId: event.requestId,
      sourceDeviceId: event.sourceDeviceId,
      targetDeviceId: event.targetDeviceId,
      replyToRequestId: event.replyToRequestId,
      payload: event.eventPayload,
      transport: event.transport
    }).catch(() => undefined)
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
    openLinksBook.touchLinkActivity(event.sourceDeviceId, Date.now(), 'inbound')
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
    openLinksBook.touchLinkActivity(event.targetDeviceId, Date.now(), 'outbound')
  })

  await adapter.addTransportErrorListener((event) => {
    const now = Date.now()
    const transportErrorDeviceId =
      typeof event.deviceId === 'string' && event.deviceId.length > 0 ? event.deviceId : undefined
    if (transportErrorDeviceId) {
      const currentDeviceId = primaryTransportState.value.deviceId
      const shouldAffectPrimaryTransport =
        !currentDeviceId || currentDeviceId === transportErrorDeviceId
      if (shouldAffectPrimaryTransport) {
        const shouldClearPrimary = !currentDeviceId || currentDeviceId === transportErrorDeviceId
        setPrimaryTransportStateWithTransitionLog(
          primaryTransportState,
          shouldClearPrimary
            ? {
                ...primaryTransportState.value,
                deviceId: undefined,
                host: undefined,
                port: undefined,
                state: 'closed',
                closedAt: now
              }
            : {
                ...primaryTransportState.value,
                state: 'closed',
                closedAt: now
              },
          { reason: 'transport_error_event' }
        )
      }
      openLinksBook.markTransportDead(transportErrorDeviceId, now)
    }
    if (shouldSuppressTransportErrorMessage(event.message)) {
      return
    }
    error.value = event.message
  })

  const snapshot = await adapter.getTransportState()
  setPrimaryTransportStateWithTransitionLog(primaryTransportState, snapshot, {
    reason: 'adapter_snapshot'
  })
  if (snapshot.state === 'open' && snapshot.deviceId) {
    openLinksBook.upsertOpenLink(
      {
        deviceId: snapshot.deviceId,
        transport: 'ready',
        app: 'pending',
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
