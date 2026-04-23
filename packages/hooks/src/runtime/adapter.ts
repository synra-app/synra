import type {
  DeviceConnectableUpdatedEvent,
  DiscoveryState,
  DiscoveredDevice,
  ListDiscoveredDevicesResult,
  StartDiscoveryOptions
} from '@synra/capacitor-lan-discovery'
import type {
  GetSessionStateResult,
  LanWireEventReceivedEvent,
  MessageAckEvent,
  MessageReceivedEvent,
  OpenSessionOptions,
  ProbeSynraPeersOptions,
  ProbeSynraPeersResult,
  SessionState,
  SendLanEventOptions,
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
  listDiscoveredDevices(): Promise<ListDiscoveredDevicesResult>
  /** Native Synra TCP probe (e.g. Capacitor). Optional on hosts that fold probe into `startDiscovery`. */
  probeSynraPeers?(options: ProbeSynraPeersOptions): Promise<ProbeSynraPeersResult>
  openSession(options: OpenSessionOptions): Promise<{
    deviceId: string
    state: SessionState
    transport: 'tcp'
  }>
  closeSession(deviceId?: string): Promise<void>
  sendMessage(options: SendMessageOptions): Promise<void>
  sendLanEvent(options: SendLanEventOptions): Promise<void>
  getSessionState(deviceId?: string): Promise<GetSessionStateResult>
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
  addLanWireEventReceivedListener(
    listener: (event: LanWireEventReceivedEvent) => void
  ): Promise<ListenerHandle>
}
