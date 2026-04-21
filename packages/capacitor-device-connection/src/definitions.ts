import type { PluginListenerHandle } from '@capacitor/core'
import type { SynraMessageType } from '@synra/protocol'

export type ConnectionTransport = 'tcp'

export type OpenSessionOptions = {
  deviceId: string
  host: string
  port: number
  token?: string
  transport?: ConnectionTransport
}

export type SessionState = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

export type SessionSnapshot = {
  sessionId?: string
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
  sessionId: string
  state: SessionState
  transport: ConnectionTransport
}

export type CloseSessionOptions = {
  sessionId?: string
  transport?: ConnectionTransport
}

export type CloseSessionResult = {
  success: true
  sessionId?: string
  transport: ConnectionTransport
}

export type SendMessageOptions = {
  sessionId: string
  messageType: SynraMessageType
  payload: unknown
  messageId?: string
  transport?: ConnectionTransport
}

export type SendMessageResult = {
  success: true
  messageId: string
  sessionId: string
  transport: ConnectionTransport
}

export type GetSessionStateOptions = {
  sessionId?: string
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
    | 'transport.message.ack'
    | 'transport.error'
    | 'host.retire'
    | 'host.member.offline'
    | 'host.heartbeat.timeout'
  remote: string
  sessionId?: string
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
  sessionId: string
  transport: ConnectionTransport
  deviceId?: string
  direction?: 'inbound' | 'outbound'
  host?: string
  port?: number
  /** Optional display name from hello / helloAck handshake metadata. */
  displayName?: string
}

export type SessionClosedEvent = {
  sessionId?: string
  transport: ConnectionTransport
  reason?: string
}

export type MessageReceivedEvent = {
  sessionId: string
  messageId?: string
  messageType: SynraMessageType
  payload: unknown
  timestamp: number
  transport: ConnectionTransport
}

export type MessageAckEvent = {
  sessionId: string
  messageId: string
  timestamp: number
  transport: ConnectionTransport
}

export type TransportErrorEvent = {
  sessionId?: string
  code?: string
  message: string
  transport: ConnectionTransport
}

export interface DeviceConnectionPlugin {
  openSession(options: OpenSessionOptions): Promise<OpenSessionResult>
  closeSession(options?: CloseSessionOptions): Promise<CloseSessionResult>
  sendMessage(options: SendMessageOptions): Promise<SendMessageResult>
  getSessionState(options?: GetSessionStateOptions): Promise<GetSessionStateResult>
  pullHostEvents(options?: { transport?: ConnectionTransport }): Promise<PullHostEventsResult>
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
    eventName: 'hostEvent',
    listenerFunc: (event: HostEvent) => void
  ): Promise<PluginListenerHandle>
}
