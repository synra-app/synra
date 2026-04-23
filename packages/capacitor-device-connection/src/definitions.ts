/** DeviceConnection exposes transport + opaque `connectAck` payloads; app-specific pairing keys live in hooks/frontend. */
import type { PluginListenerHandle } from '@capacitor/core'
import type { SynraMessageType } from '@synra/protocol'

export type ConnectionTransport = 'tcp'

/** App-layer enum for Synra `connect` payload; native code forwards only. */
export type SynraLanConnectType = 'fresh' | 'paired'

export type OpenSessionOptions = {
  deviceId: string
  host: string
  port: number
  token?: string
  /** Copied onto Synra `connect` payload by transport; set by caller (e.g. hooks). */
  connectType: SynraLanConnectType
  transport?: ConnectionTransport
}

export type SessionState = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

export type SessionSnapshot = {
  deviceId?: string
  host?: string
  port?: number
  state: SessionState
  direction?: 'inbound' | 'outbound'
  transport: ConnectionTransport
  lastError?: string
  openedAt?: number
  closedAt?: number
}

export type OpenSessionResult = {
  success: true
  deviceId: string
  state: SessionState
  transport: ConnectionTransport
  /** Raw `connectAck` JSON payload from the peer (protocol-level; app interprets keys). */
  connectAckPayload?: Record<string, unknown>
}

export type CloseSessionOptions = {
  targetDeviceId?: string
  transport?: ConnectionTransport
}

export type CloseSessionResult = {
  success: true
  targetDeviceId?: string
  transport: ConnectionTransport
}

export type SendMessageOptions = {
  requestId: string
  sourceDeviceId: string
  targetDeviceId: string
  replyToRequestId?: string
  messageType: SynraMessageType
  payload: unknown
  messageId?: string
  transport?: ConnectionTransport
}

export type SendMessageResult = {
  success: true
  messageId: string
  targetDeviceId: string
  transport: ConnectionTransport
}

export type SendLanEventOptions = {
  requestId: string
  sourceDeviceId: string
  targetDeviceId: string
  replyToRequestId?: string
  eventName: string
  payload?: unknown
  eventId?: string
  schemaVersion?: number
  transport?: ConnectionTransport
}

export type SendLanEventResult = {
  success: true
  targetDeviceId: string
  transport: ConnectionTransport
}

export type GetSessionStateOptions = {
  targetDeviceId?: string
  transport?: ConnectionTransport
}

export type GetSessionStateResult = SessionSnapshot

export type HostEvent = {
  id: number
  timestamp: number
  type:
    | 'transport.session.opened'
    | 'transport.session.closed'
    | 'transport.message.received'
    | 'transport.lan.event.received'
    | 'transport.message.ack'
    | 'transport.error'
    | 'host.member.online'
    | 'host.retire'
    | 'host.member.offline'
    | 'host.heartbeat.timeout'
  remote: string
  deviceId?: string
  messageId?: string
  messageType?: SynraMessageType
  code?: string
  payload?: unknown
  transport: ConnectionTransport
}

export type PullHostEventsResult = {
  events: HostEvent[]
}

export type SessionOpenedEvent = {
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
  /** Empty targets are allowed and should resolve with `results: []` (silent no-op). */
  targets: SynraProbeTarget[]
  timeoutMs?: number
}

export type ProbeSynraPeersResult = {
  results: SynraProbeResult[]
}

export type LanWireEventReceivedEvent = {
  requestId: string
  sourceDeviceId: string
  targetDeviceId: string
  replyToRequestId?: string
  eventName: string
  eventPayload: unknown
  transport: ConnectionTransport
}

export type SessionClosedEvent = {
  deviceId?: string
  transport: ConnectionTransport
  reason?: string
}

export type MessageReceivedEvent = {
  requestId: string
  sourceDeviceId: string
  targetDeviceId: string
  replyToRequestId?: string
  messageId?: string
  messageType: SynraMessageType
  payload: unknown
  timestamp: number
  transport: ConnectionTransport
}

export type MessageAckEvent = {
  targetDeviceId: string
  requestId: string
  messageId: string
  timestamp: number
  transport: ConnectionTransport
}

export type TransportErrorEvent = {
  deviceId?: string
  code?: string
  message: string
  transport: ConnectionTransport
}

export interface DeviceConnectionPlugin {
  openSession(options: OpenSessionOptions): Promise<OpenSessionResult>
  closeSession(options?: CloseSessionOptions): Promise<CloseSessionResult>
  sendMessage(options: SendMessageOptions): Promise<SendMessageResult>
  sendLanEvent(options: SendLanEventOptions): Promise<SendLanEventResult>
  getSessionState(options?: GetSessionStateOptions): Promise<GetSessionStateResult>
  pullHostEvents(options?: { transport?: ConnectionTransport }): Promise<PullHostEventsResult>
  probeSynraPeers(options: ProbeSynraPeersOptions): Promise<ProbeSynraPeersResult>
  addListener(
    eventName: 'sessionOpened',
    listenerFunc: (event: SessionOpenedEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'sessionClosed',
    listenerFunc: (event: SessionClosedEvent) => void
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
