import type {
  DeviceConnectableUpdatedEvent,
  DiscoveryState,
  DiscoveredDevice,
  StartDiscoveryOptions
} from '@synra/capacitor-lan-discovery'
import type {
  GetSessionStateResult,
  MessageAckEvent,
  MessageReceivedEvent,
  OpenSessionOptions,
  SessionState,
  SendMessageOptions,
  SessionClosedEvent,
  SessionOpenedEvent,
  TransportErrorEvent
} from '@synra/capacitor-device-connection'

export type ListenerHandle = {
  remove: () => Promise<void>
}

export type DeviceLostEvent = {
  deviceId: string
  ipAddress?: string
}

export interface ConnectionRuntimeAdapter {
  startDiscovery(options: StartDiscoveryOptions): Promise<{
    state: DiscoveryState
    devices: DiscoveredDevice[]
  }>
  openSession(options: OpenSessionOptions): Promise<{
    sessionId: string
    state: SessionState
    transport: 'tcp'
  }>
  closeSession(sessionId?: string): Promise<void>
  sendMessage(options: SendMessageOptions): Promise<void>
  getSessionState(sessionId?: string): Promise<GetSessionStateResult>
  addDeviceConnectableUpdatedListener(
    listener: (event: DeviceConnectableUpdatedEvent) => void
  ): Promise<ListenerHandle>
  addDeviceLostListener(listener: (event: DeviceLostEvent) => void): Promise<ListenerHandle>
  addSessionOpenedListener(listener: (event: SessionOpenedEvent) => void): Promise<ListenerHandle>
  addSessionClosedListener(listener: (event: SessionClosedEvent) => void): Promise<ListenerHandle>
  addMessageReceivedListener(
    listener: (event: MessageReceivedEvent) => void
  ): Promise<ListenerHandle>
  addMessageAckListener(listener: (event: MessageAckEvent) => void): Promise<ListenerHandle>
  addTransportErrorListener(listener: (event: TransportErrorEvent) => void): Promise<ListenerHandle>
}
