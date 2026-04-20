export const PROTOCOL_VERSION = '1.0' as const

export type DeviceId = string
export type SessionId = string
export type TraceId = string
export type MessageId = string
export type ActionId = string

export type LegacySynraMessageType =
  | 'share.detected'
  | 'action.proposed'
  | 'action.selected'
  | 'action.executing'
  | 'action.completed'
  | 'action.failed'

export type TransportMessageType =
  | 'transport.session.opened'
  | 'transport.session.closed'
  | 'transport.message.received'
  | 'transport.message.ack'
  | 'transport.error'

export type ClusterSessionMessageType = 'session.open' | 'session.close' | 'session.keepalive'

export type RelayMessageType = 'relay.request' | 'relay.ack' | 'relay.result'

export type ClusterHostMessageType =
  | 'host.announce'
  | 'host.retire'
  | 'host.member.offline'
  | 'host.heartbeat'

export type ElectionMessageType =
  | 'election.vote.request'
  | 'election.vote.response'
  | 'election.win'

export type CustomMessageType = `custom.${string}`

export type SynraMessageType =
  | LegacySynraMessageType
  | TransportMessageType
  | ClusterSessionMessageType
  | RelayMessageType
  | ClusterHostMessageType
  | ElectionMessageType
  | CustomMessageType

export type RuntimeMessageType =
  | 'runtime.request'
  | 'runtime.received'
  | 'runtime.started'
  | 'runtime.finished'
  | 'runtime.error'

export type PluginSyncMessageType = 'plugin.catalog.request' | 'plugin.catalog.response'

export type ProtocolMessageType = RuntimeMessageType | PluginSyncMessageType

export type ShareDetectedPayload = {
  inputType: 'text' | 'url' | 'file'
  raw: string
  metadata?: Record<string, unknown>
}

export type ActionProposedPayload = {
  actionId: ActionId
  pluginId: string
  actionType: string
  label: string
  requiresConfirm: boolean
  payload: unknown
}

export type ActionExecutingPayload = {
  actionId: ActionId
  pluginId: string
  startedAt: number
}

export type ActionCompletedPayload = {
  actionId: ActionId
  pluginId: string
  finishedAt: number
  output?: unknown
}

export type ActionFailedPayload = {
  actionId: ActionId
  pluginId: string
  finishedAt: number
  code: SynraErrorCode
  message: string
  retryable: boolean
  details?: unknown
}

export type TransportSessionOpenedPayload = {
  sessionId: SessionId
  deviceId?: DeviceId
  host?: string
  port?: number
  openedAt: number
}

export type TransportSessionClosedPayload = {
  sessionId: SessionId
  closedAt: number
  reason?: string
}

export type TransportMessageReceivedPayload = {
  sessionId: SessionId
  messageId?: MessageId
  messageType: SynraMessageType
  payload: unknown
  timestamp: number
  remote?: string
}

export type TransportMessageAckPayload = {
  sessionId: SessionId
  messageId: MessageId
  timestamp: number
}

export type TransportErrorPayload = {
  sessionId?: SessionId
  code: SynraErrorCode | 'TRANSPORT_IO_ERROR'
  message: string
  retryable?: boolean
  details?: unknown
}

export type SessionOpenPayload = {
  nodeId: DeviceId
  requestedAt: number
}

export type SessionClosePayload = {
  sessionId: SessionId
  reason?: string
  closedAt: number
}

export type SessionKeepalivePayload = {
  sessionId: SessionId
  sentAt: number
}

export type RelayRequestPayload = {
  requestId: string
  routeTo: DeviceId
  data: unknown
}

export type RelayAckPayload = {
  requestId: string
  ackedAt: number
}

export type RelayResultPayload = {
  requestId: string
  ok: boolean
  result?: unknown
  error?: ProtocolErrorPayload
}

export type HostAnnouncePayload = {
  hostId: DeviceId
  term: number
  epoch: number
}

export type HostRetirePayload = {
  hostId: DeviceId
  term: number
  retireAt: number
  reason?: string
}

export type HostMemberOfflinePayload = {
  nodeId: DeviceId
  sessionId?: SessionId
  offlineAt: number
  reason?: string
}

export type HostHeartbeatPayload = {
  hostId: DeviceId
  term?: number
  epoch?: number
  timestamp: number
}

export type ElectionVoteRequestPayload = {
  candidateId: DeviceId
  term: number
  candidateEpochHint?: number
}

export type ElectionVoteResponsePayload = {
  voterId: DeviceId
  term: number
  granted: boolean
}

export type ElectionWinPayload = {
  hostId: DeviceId
  term: number
  epoch: number
}

export type SynraCrossDevicePayloadByType = {
  'share.detected': ShareDetectedPayload
  'action.proposed': ActionProposedPayload
  'action.selected': SynraActionRequest
  'action.executing': ActionExecutingPayload
  'action.completed': ActionCompletedPayload
  'action.failed': ActionFailedPayload
  'transport.session.opened': TransportSessionOpenedPayload
  'transport.session.closed': TransportSessionClosedPayload
  'transport.message.received': TransportMessageReceivedPayload
  'transport.message.ack': TransportMessageAckPayload
  'transport.error': TransportErrorPayload
  'session.open': SessionOpenPayload
  'session.close': SessionClosePayload
  'session.keepalive': SessionKeepalivePayload
  'relay.request': RelayRequestPayload
  'relay.ack': RelayAckPayload
  'relay.result': RelayResultPayload
  'host.announce': HostAnnouncePayload
  'host.retire': HostRetirePayload
  'host.member.offline': HostMemberOfflinePayload
  'host.heartbeat': HostHeartbeatPayload
  'election.vote.request': ElectionVoteRequestPayload
  'election.vote.response': ElectionVoteResponsePayload
  'election.win': ElectionWinPayload
} & {
  [K in CustomMessageType]: unknown
}

export type SynraCrossDeviceMessage<
  TType extends SynraMessageType = SynraMessageType,
  TPayload = SynraCrossDevicePayloadByType[TType]
> = {
  protocolVersion: typeof PROTOCOL_VERSION
  messageId: MessageId
  sessionId: SessionId
  traceId: TraceId
  type: TType
  sentAt: number
  ttlMs: number
  fromDeviceId: DeviceId
  toDeviceId: DeviceId
  payload: TPayload
}

export type ProtocolEnvelope<TType extends ProtocolMessageType, TPayload> = {
  protocolVersion: typeof PROTOCOL_VERSION
  messageId: MessageId
  sessionId: SessionId
  timestamp: number
  type: TType
  payload: TPayload
}

export type SynraActionRequest<TPayload = unknown> = {
  actionId: ActionId
  pluginId: string
  actionType: string
  payload: TPayload
}

export type SynraErrorCode =
  | 'INVALID_PARAMS'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'TIMEOUT'
  | 'UNSUPPORTED_OPERATION'
  | 'INTERNAL_ERROR'
  | 'TRANSPORT_DISCONNECTED'
  | 'TRANSPORT_UNREACHABLE'
  | 'PAIRING_REQUIRED'
  | 'PAIRING_EXPIRED'
  | 'RUNTIME_NOT_READY'
  | 'RUNTIME_EXECUTION_FAILED'
  | 'PLUGIN_NOT_FOUND'
  | 'PLUGIN_ACTION_INVALID'
  | 'USER_CANCELLED'

export type ProtocolErrorCode = SynraErrorCode

export type RuntimeFinishedStatus = 'success' | 'failed' | 'cancelled'

export type RuntimeRequestPayload<TInput = unknown> = {
  input: TInput
  requestedAt: number
}

export type RuntimeReceivedPayload = {
  acknowledgedAt: number
}

export type RuntimeStartedPayload = {
  startedAt: number
}

export type ProtocolErrorPayload = {
  code: ProtocolErrorCode
  message: string
  details?: unknown
}

export type RuntimeFinishedPayload<TResult = unknown> = {
  status: RuntimeFinishedStatus
  finishedAt: number
  result?: TResult
  error?: ProtocolErrorPayload
}

export type RuntimeErrorPayload = {
  code: ProtocolErrorCode
  message: string
  retryable?: boolean
  details?: unknown
}

export type PluginCatalogRequestPayload = {
  knownPluginIds?: string[]
}

export type PluginCatalogItem = {
  pluginId: string
  version: string
  displayName: string
  status?: 'installed' | 'available'
  builtin?: boolean
  defaultPage?: string
  icon?: string
  logoPath?: string
  packageName?: string
}

export type PluginCatalogResponsePayload = {
  plugins: PluginCatalogItem[]
  generatedAt: number
}

export type ProtocolPayloadByType = {
  'runtime.request': RuntimeRequestPayload
  'runtime.received': RuntimeReceivedPayload
  'runtime.started': RuntimeStartedPayload
  'runtime.finished': RuntimeFinishedPayload
  'runtime.error': RuntimeErrorPayload
  'plugin.catalog.request': PluginCatalogRequestPayload
  'plugin.catalog.response': PluginCatalogResponsePayload
}

type MessageByType<K extends keyof ProtocolPayloadByType> = ProtocolEnvelope<
  K,
  ProtocolPayloadByType[K]
>

export type SynraRuntimeMessage =
  | MessageByType<'runtime.request'>
  | MessageByType<'runtime.received'>
  | MessageByType<'runtime.started'>
  | MessageByType<'runtime.finished'>
  | MessageByType<'runtime.error'>

export type SynraPluginSyncMessage =
  | MessageByType<'plugin.catalog.request'>
  | MessageByType<'plugin.catalog.response'>

export type SynraProtocolMessage = SynraRuntimeMessage | SynraPluginSyncMessage

export type SynraActionReceipt =
  | {
      ok: true
      actionId: ActionId
      handledBy: string
      durationMs: number
      output?: unknown
    }
  | {
      ok: false
      actionId: ActionId
      handledBy: string
      durationMs: number
      retryable: boolean
      error: {
        code: SynraErrorCode
        message: string
        details?: unknown
      }
    }

export function unknownToErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function createMessage<TPayload>(
  input: Omit<SynraCrossDeviceMessage<SynraMessageType, TPayload>, 'protocolVersion'>
): SynraCrossDeviceMessage<SynraMessageType, TPayload> {
  return {
    ...input,
    protocolVersion: PROTOCOL_VERSION
  }
}

export function createProtocolMessage<TType extends keyof ProtocolPayloadByType>(
  input: Omit<ProtocolEnvelope<TType, ProtocolPayloadByType[TType]>, 'protocolVersion'>
): ProtocolEnvelope<TType, ProtocolPayloadByType[TType]> {
  return {
    ...input,
    protocolVersion: PROTOCOL_VERSION
  }
}
