import type {
  DeviceConnectableUpdatedEvent,
  DiscoveryState,
  DiscoveredDevice,
  ListDiscoveredDevicesResult,
  StartDiscoveryOptions
} from '@synra/capacitor-lan-discovery'
import type {
  GetTransportStateResult,
  LanWireEventReceivedEvent,
  MessageAckEvent,
  MessageReceivedEvent,
  OpenTransportOptions,
  ProbeSynraPeersOptions,
  ProbeSynraPeersResult,
  TransportState,
  SendLanEventOptions,
  SendMessageOptions,
  TransportClosedEvent,
  TransportOpenedEvent,
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
  openTransport(options: OpenTransportOptions): Promise<{
    deviceId: string
    state: TransportState
    transport: 'tcp'
  }>
  closeTransport(deviceId?: string): Promise<void>
  sendMessage(options: SendMessageOptions): Promise<void>
  sendLanEvent(options: SendLanEventOptions): Promise<void>
  getTransportState(deviceId?: string): Promise<GetTransportStateResult>
  addDeviceConnectableUpdatedListener(
    listener: (event: DeviceConnectableUpdatedEvent) => void
  ): Promise<ListenerHandle>
  addDeviceLostListener(listener: (event: DeviceLostEvent) => void): Promise<ListenerHandle>
  addTransportOpenedListener(
    listener: (event: TransportOpenedEvent) => void
  ): Promise<ListenerHandle>
  addTransportClosedListener(
    listener: (event: TransportClosedEvent) => void
  ): Promise<ListenerHandle>
  addMessageReceivedListener(
    listener: (event: MessageReceivedEvent) => void
  ): Promise<ListenerHandle>
  addMessageAckListener(listener: (event: MessageAckEvent) => void): Promise<ListenerHandle>
  addTransportErrorListener(listener: (event: TransportErrorEvent) => void): Promise<ListenerHandle>
  addLanWireEventReceivedListener(
    listener: (event: LanWireEventReceivedEvent) => void
  ): Promise<ListenerHandle>
}
