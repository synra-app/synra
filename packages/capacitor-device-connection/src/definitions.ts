/** DeviceConnection exposes transport + opaque `connectAck` payloads; app-specific pairing keys live in hooks/frontend. */
import type { PluginListenerHandle } from '@capacitor/core'
import type { LanWireEventName } from '@synra/protocol'

export type ConnectionTransport = 'tcp'

/** App-layer enum for Synra `connect` payload; native code forwards only. */
export type SynraLanConnectType = 'fresh' | 'paired'

export type OpenTransportOptions = {
  deviceId: string
  host: string
  port: number
  token?: string
  /** Copied onto Synra `connect` payload by transport; set by caller (e.g. hooks). */
  connectType: SynraLanConnectType
  transport?: ConnectionTransport
}

export type TransportState = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

export type TransportSnapshot = {
  deviceId?: string
  host?: string
  port?: number
  state: TransportState
  direction?: 'inbound' | 'outbound'
  transport: ConnectionTransport
  lastError?: string
  openedAt?: number
  closedAt?: number
}

export type OpenTransportResult = {
  success: true
  deviceId: string
  state: TransportState
  transport: ConnectionTransport
  /** Raw `connectAck` JSON payload from the peer (protocol-level; app interprets keys). */
  connectAckPayload?: Record<string, unknown>
}

export type CloseTransportOptions = {
  target?: string
  transport?: ConnectionTransport
}

export type CloseTransportResult = {
  success: true
  target?: string
  transport: ConnectionTransport
}

export type SendMessageOptions = {
  requestId: string
  event: string
  target: string
  from: string
  replyRequestId?: string
  payload: unknown
  timestamp?: number
  transport?: ConnectionTransport
}

export type SendMessageResult = {
  success: true
  target: string
  transport: ConnectionTransport
}

export type SendLanEventOptions = {
  requestId: string
  event: LanWireEventName
  target: string
  from: string
  replyRequestId?: string
  payload?: unknown
  timestamp?: number
  transport?: ConnectionTransport
}

export type SendLanEventResult = {
  success: true
  target: string
  transport: ConnectionTransport
}

export type GetTransportStateOptions = {
  target?: string
  transport?: ConnectionTransport
}

export type GetTransportStateResult = TransportSnapshot

export type HostEvent = {
  id: number
  timestamp: number
  type:
    | 'transport.opened'
    | 'transport.closed'
    | 'transport.message.received'
    | 'transport.lan.event.received'
    | 'transport.message.ack'
    | 'transport.error'
    | 'host.member.online'
    | 'host.retire'
    | 'host.member.offline'
    | 'host.heartbeat.timeout'
  event?: string
  target?: string
  from?: string
  replyRequestId?: string
  deviceId?: string
  code?: string
  payload?: unknown
  transport: ConnectionTransport
}

export type PullHostEventsResult = {
  events: HostEvent[]
}

export type TransportOpenedEvent = {
  deviceId: string
  transport: ConnectionTransport
  direction?: 'inbound' | 'outbound'
  host?: string
  port?: number
  /** Optional display name from connect / connectAck. */
  displayName?: string
  /** Opaque peer `connect` frame payload (transport pass-through). */
  incomingSynraConnectPayload?: Record<string, unknown>
  /** Local or peer `connectAck` envelope payload (opaque to the plugin). */
  connectAckPayload?: Record<string, unknown>
}

export type SynraProbeTarget = {
  host: string
  port?: number
  /** Merged into Synra `connect` payload for this probe (caller-defined wire keys). */
  connectWirePayload?: Record<string, unknown>
}

export type SynraProbeResult = {
  host: string
  port: number
  ok: boolean
  wireSourceDeviceId?: string
  displayName?: string
  connectAckPayload?: Record<string, unknown>
  error?: string
}

/**
 * Returned by Electron main `probeSynraPeers` stub: discovery already validated peers,
 * so failed probe rows must not prune the scan list.
 */
export const SYNRA_PROBE_EMBEDDED_IN_DISCOVERY = 'SYNRA_PROBE_EMBEDDED_IN_DISCOVERY' as const

export type ProbeSynraPeersOptions = {
  /** Empty targets are allowed and will resolve with `results: []` (silent no-op). */
  targets: SynraProbeTarget[]
  timeoutMs?: number
}

export type ProbeSynraPeersResult = {
  results: SynraProbeResult[]
}

export type LanWireEventReceivedEvent = {
  requestId: string
  event: LanWireEventName
  target: string
  from: string
  replyRequestId?: string
  payload: unknown
  timestamp: number
  transport: ConnectionTransport
}

export type TransportClosedEvent = {
  deviceId?: string
  transport: ConnectionTransport
  reason?: string
}

export type MessageReceivedEvent = {
  requestId: string
  event: string
  target: string
  from: string
  replyRequestId?: string
  payload: unknown
  timestamp: number
  transport: ConnectionTransport
}

export type MessageAckEvent = {
  target: string
  event?: string
  from?: string
  replyRequestId: string
  requestId: string
  timestamp: number
  transport: ConnectionTransport
}

export type TransportErrorEvent = {
  deviceId?: string
  code?: DeviceConnectionTransportErrorCode
  message: string
  transport: ConnectionTransport
}

export const DEVICE_CONNECTION_TRANSPORT_ERROR_CODES = {
  transportIoError: 'TRANSPORT_IO_ERROR',
  hostHeartbeatTimeout: 'HOST_HEARTBEAT_TIMEOUT',
  heartbeatSendFailed: 'HEARTBEAT_SEND_FAILED',
  connectInvalid: 'CONNECT_INVALID',
  connectNotEstablished: 'CONNECT_NOT_ESTABLISHED'
} as const

export type DeviceConnectionTransportErrorCode =
  (typeof DEVICE_CONNECTION_TRANSPORT_ERROR_CODES)[keyof typeof DEVICE_CONNECTION_TRANSPORT_ERROR_CODES]

export interface DeviceConnectionPlugin {
  openTransport(options: OpenTransportOptions): Promise<OpenTransportResult>
  closeTransport(options?: CloseTransportOptions): Promise<CloseTransportResult>
  sendMessage(options: SendMessageOptions): Promise<SendMessageResult>
  sendLanEvent(options: SendLanEventOptions): Promise<SendLanEventResult>
  getTransportState(options?: GetTransportStateOptions): Promise<GetTransportStateResult>
  pullHostEvents(options?: { transport?: ConnectionTransport }): Promise<PullHostEventsResult>
  probeSynraPeers(options: ProbeSynraPeersOptions): Promise<ProbeSynraPeersResult>
  addListener(
    eventName: 'transportOpened',
    listenerFunc: (event: TransportOpenedEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'transportClosed',
    listenerFunc: (event: TransportClosedEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'messageReceived',
    listenerFunc: (event: MessageReceivedEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'messageAck',
    listenerFunc: (event: MessageAckEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'transportError',
    listenerFunc: (event: TransportErrorEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'lanWireEventReceived',
    listenerFunc: (event: LanWireEventReceivedEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'hostEvent',
    listenerFunc: (event: HostEvent) => void
  ): Promise<PluginListenerHandle>
}
