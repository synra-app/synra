import type {
  DeviceConnectionTransportErrorCode,
  HostEvent,
  LanWireEventReceivedEvent,
  SendMessageOptions,
  TransportClosedEvent,
  TransportOpenedEvent,
  TransportErrorEvent
} from '@synra/capacitor-device-connection'
import { DEVICE_CONNECTION_TRANSPORT_ERROR_CODES as TRANSPORT_ERROR_CODES } from '@synra/capacitor-device-connection'
import { isLanWireEventName } from '@synra/protocol'

function isTransportErrorCode(value: unknown): value is DeviceConnectionTransportErrorCode {
  return Object.values(TRANSPORT_ERROR_CODES).includes(value as DeviceConnectionTransportErrorCode)
}

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

export function mapTransportOpenedHostEvent(event: HostEvent): TransportOpenedEvent | undefined {
  if (event.type !== 'transport.opened') {
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
  const incomingSynraConnectPayload =
    payload.incomingSynraConnectPayload && typeof payload.incomingSynraConnectPayload === 'object'
      ? (payload.incomingSynraConnectPayload as Record<string, unknown>)
      : undefined
  const connectAckPayload =
    payload.connectAckPayload && typeof payload.connectAckPayload === 'object'
      ? (payload.connectAckPayload as Record<string, unknown>)
      : undefined
  return {
    deviceId: deviceId ?? '',
    direction,
    host: hostFromPayload,
    port: Number.isFinite(portFromPayload) ? portFromPayload : undefined,
    displayName: displayName && displayName.length > 0 ? displayName : undefined,
    incomingSynraConnectPayload,
    connectAckPayload,
    transport: event.transport ?? 'tcp'
  }
}

export function mapLanWireEventReceivedHostEvent(
  event: HostEvent
): LanWireEventReceivedEvent | undefined {
  if (event.type !== 'transport.lan.event.received') {
    return undefined
  }
  const pl =
    event.payload && typeof event.payload === 'object'
      ? (event.payload as Record<string, unknown>)
      : {}
  const requestId = typeof pl.requestId === 'string' ? pl.requestId : ''
  const from =
    typeof pl.from === 'string' ? pl.from : typeof event.from === 'string' ? event.from : ''
  const target =
    typeof pl.target === 'string' ? pl.target : typeof event.target === 'string' ? event.target : ''
  if (!requestId || !from || !target) {
    return undefined
  }
  const candidateEvent =
    typeof pl.event === 'string' && pl.event.length > 0 ? pl.event : (event.event ?? '')
  if (!isLanWireEventName(candidateEvent)) {
    return undefined
  }
  return {
    requestId,
    from,
    target,
    replyRequestId:
      typeof pl.replyRequestId === 'string' ? pl.replyRequestId : event.replyRequestId,
    event: candidateEvent,
    payload: 'payload' in pl ? pl.payload : undefined,
    timestamp: event.timestamp,
    transport: event.transport ?? 'tcp'
  }
}

export function mapTransportClosedHostEvent(event: HostEvent): TransportClosedEvent | undefined {
  if (event.type === 'transport.closed') {
    const payload =
      event.payload && typeof event.payload === 'object'
        ? (event.payload as Record<string, unknown>)
        : {}
    return {
      deviceId: typeof payload.deviceId === 'string' ? payload.deviceId : event.deviceId,
      reason: readReasonFromPayload(event.payload) ?? 'peer-closed',
      transport: event.transport
    }
  }
  if (event.type === 'host.heartbeat.timeout') {
    return {
      deviceId: event.deviceId,
      reason: event.code ?? 'host-heartbeat-timeout',
      transport: event.transport
    }
  }
  return undefined
}

export function mapTransportErrorHostEvent(event: HostEvent): TransportErrorEvent | undefined {
  if (event.type === 'transport.error') {
    return {
      deviceId: event.deviceId,
      code: isTransportErrorCode(event.code) ? event.code : TRANSPORT_ERROR_CODES.transportIoError,
      message: normalizeTransportErrorMessage(event.payload),
      transport: event.transport
    }
  }
  if (event.type === 'host.heartbeat.timeout') {
    return {
      deviceId: event.deviceId,
      code: isTransportErrorCode(event.code)
        ? event.code
        : TRANSPORT_ERROR_CODES.hostHeartbeatTimeout,
      message: 'Peer heartbeat timeout.',
      transport: event.transport
    }
  }
  return undefined
}

export function mapMessageTypeFromHostEvent(
  event: HostEvent
): SendMessageOptions['event'] | undefined {
  if (event.type !== 'transport.message.received') {
    return undefined
  }
  return (event.event ?? 'transport.message.received') as SendMessageOptions['event']
}
