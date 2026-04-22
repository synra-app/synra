import type { SendMessageOptions } from '@synra/capacitor-device-connection'
import type {
  HostEvent,
  SessionClosedEvent,
  SessionOpenedEvent,
  TransportErrorEvent
} from '@synra/capacitor-device-connection'

function readReasonFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined
  }
  const reason = (payload as { reason?: unknown }).reason
  if (typeof reason !== 'string') {
    return undefined
  }
  const trimmed = reason.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeTransportErrorMessage(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload
  }
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message?: unknown }).message
    if (typeof message === 'string') {
      return message
    }
    return JSON.stringify(message ?? 'Transport error')
  }
  return 'Transport error'
}

export function mapSessionOpenedHostEvent(event: HostEvent): SessionOpenedEvent | undefined {
  if (event.type !== 'transport.session.opened' || !event.sessionId) {
    return undefined
  }
  const payload =
    event.payload && typeof event.payload === 'object'
      ? (event.payload as Record<string, unknown>)
      : {}
  const hostFromPayload = typeof payload.host === 'string' ? payload.host : undefined
  const portFromPayload = typeof payload.port === 'number' ? payload.port : undefined
  const deviceId = typeof payload.deviceId === 'string' ? payload.deviceId : undefined
  const direction =
    payload.direction === 'inbound' || payload.direction === 'outbound'
      ? payload.direction
      : undefined
  const displayName = typeof payload.displayName === 'string' ? payload.displayName : undefined
  const pairedRaw = payload.pairedPeerDeviceIds
  const pairedPeerDeviceIds = Array.isArray(pairedRaw)
    ? pairedRaw.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : undefined
  const handshakeKind =
    payload.handshakeKind === 'paired' || payload.handshakeKind === 'fresh'
      ? payload.handshakeKind
      : undefined
  const claimsPeerPaired =
    typeof payload.claimsPeerPaired === 'boolean' ? payload.claimsPeerPaired : undefined
  const fallbackRemote = typeof event.remote === 'string' ? event.remote : ''
  const [hostPart, portText] = fallbackRemote.split(':')
  const parsedRemotePort = Number.parseInt(portText ?? '', 10)

  return {
    sessionId: event.sessionId,
    deviceId,
    direction,
    host: hostFromPayload ?? (hostPart.length > 0 ? hostPart : undefined),
    port: Number.isFinite(portFromPayload)
      ? portFromPayload
      : Number.isFinite(parsedRemotePort)
        ? parsedRemotePort
        : undefined,
    displayName: displayName && displayName.length > 0 ? displayName : undefined,
    pairedPeerDeviceIds,
    handshakeKind,
    claimsPeerPaired,
    transport: event.transport ?? 'tcp'
  }
}

export function mapSessionClosedHostEvent(event: HostEvent): SessionClosedEvent | undefined {
  if (event.type === 'transport.session.closed') {
    return {
      sessionId: event.sessionId,
      reason: readReasonFromPayload(event.payload) ?? 'peer-closed',
      transport: event.transport
    }
  }
  if (event.type === 'host.heartbeat.timeout') {
    return {
      sessionId: event.sessionId,
      reason: event.code ?? 'host-heartbeat-timeout',
      transport: event.transport
    }
  }
  return undefined
}

export function mapTransportErrorHostEvent(event: HostEvent): TransportErrorEvent | undefined {
  if (event.type === 'transport.error') {
    return {
      sessionId: event.sessionId,
      code: event.code,
      message: normalizeTransportErrorMessage(event.payload),
      transport: event.transport
    }
  }
  if (event.type === 'host.heartbeat.timeout') {
    return {
      sessionId: event.sessionId,
      code: event.code ?? 'HOST_HEARTBEAT_TIMEOUT',
      message: 'Peer heartbeat timeout.',
      transport: event.transport
    }
  }
  return undefined
}

export function mapMessageTypeFromHostEvent(
  event: HostEvent
): SendMessageOptions['messageType'] | undefined {
  if (event.type !== 'transport.message.received') {
    return undefined
  }
  return (event.messageType ?? 'transport.message.received') as SendMessageOptions['messageType']
}
