import type {
  DeviceConnectableUpdatedEvent,
  DiscoveredDevice,
  StartDiscoveryOptions
} from '@synra/capacitor-lan-discovery'
import type {
  GetSessionStateResult,
  HostEvent,
  MessageAckEvent,
  MessageReceivedEvent,
  OpenSessionOptions,
  SendMessageOptions,
  SessionClosedEvent,
  SessionOpenedEvent,
  TransportErrorEvent
} from '@synra/capacitor-device-connection'

export type ListenerHandle = {
  remove: () => Promise<void>
}

export interface ConnectionRuntimeAdapter {
  getDiscoveredDevices(): Promise<{
    state: string
    startedAt?: number
    scanWindowMs: number
    devices: DiscoveredDevice[]
  }>
  startDiscovery(options: StartDiscoveryOptions): Promise<{
    state: string
    startedAt?: number
    scanWindowMs: number
    devices: DiscoveredDevice[]
  }>
  stopDiscovery(): Promise<void>
  probeConnectable(port: number, timeoutMs: number): Promise<{ devices: DiscoveredDevice[] }>
  openSession(options: OpenSessionOptions): Promise<{
    sessionId: string
    state: string
    transport: 'tcp'
  }>
  closeSession(sessionId?: string): Promise<void>
  sendMessage(options: SendMessageOptions): Promise<void>
  getSessionState(sessionId?: string): Promise<GetSessionStateResult>
  pullHostEvents(): Promise<{ events: HostEvent[] }>
  addDeviceConnectableUpdatedListener(
    listener: (event: DeviceConnectableUpdatedEvent) => void
  ): Promise<ListenerHandle>
  addSessionOpenedListener(listener: (event: SessionOpenedEvent) => void): Promise<ListenerHandle>
  addSessionClosedListener(listener: (event: SessionClosedEvent) => void): Promise<ListenerHandle>
  addMessageReceivedListener(
    listener: (event: MessageReceivedEvent) => void
  ): Promise<ListenerHandle>
  addMessageAckListener(listener: (event: MessageAckEvent) => void): Promise<ListenerHandle>
  addTransportErrorListener(listener: (event: TransportErrorEvent) => void): Promise<ListenerHandle>
}
