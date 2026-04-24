import type {
  HostEvent,
  LanWireEventReceivedEvent,
  SendMessageOptions,
  TransportClosedEvent,
  TransportOpenedEvent,
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
  const fallbackRemote = typeof event.remote === 'string' ? event.remote : ''
  const [hostPart, portText] = fallbackRemote.split(':')
  const parsedRemotePort = Number.parseInt(portText ?? '', 10)

  return {
    deviceId: deviceId ?? '',
    direction,
    host: hostFromPayload ?? (hostPart.length > 0 ? hostPart : undefined),
    port: Number.isFinite(portFromPayload)
      ? portFromPayload
      : Number.isFinite(parsedRemotePort)
        ? parsedRemotePort
        : undefined,
    displayName: displayName && displayName.length > 0 ? displayName : undefined,
    incomingSynraConnectPayload,
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
  const eventName = typeof pl.eventName === 'string' ? pl.eventName : ''
  const requestId = typeof pl.requestId === 'string' ? pl.requestId : ''
  const sourceDeviceId = typeof pl.sourceDeviceId === 'string' ? pl.sourceDeviceId : ''
  const targetDeviceId = typeof pl.targetDeviceId === 'string' ? pl.targetDeviceId : ''
  if (!requestId || !sourceDeviceId || !targetDeviceId) {
    return undefined
  }
  const inner =
    pl.eventPayload !== undefined ? pl.eventPayload : 'payload' in pl ? pl.payload : undefined
  return {
    requestId,
    sourceDeviceId,
    targetDeviceId,
    replyToRequestId: typeof pl.replyToRequestId === 'string' ? pl.replyToRequestId : undefined,
    eventName,
    eventPayload: inner,
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
      code: event.code,
      message: normalizeTransportErrorMessage(event.payload),
      transport: event.transport
    }
  }
  if (event.type === 'host.heartbeat.timeout') {
    return {
      deviceId: event.deviceId,
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
