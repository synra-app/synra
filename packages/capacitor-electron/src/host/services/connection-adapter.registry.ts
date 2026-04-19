import type {
  DeviceDiscoveryPullHostEventsResult,
  DeviceSessionCloseOptions,
  DeviceSessionCloseResult,
  DeviceSessionGetStateOptions,
  DeviceSessionOpenOptions,
  DeviceSessionOpenResult,
  DeviceSessionSendMessageOptions,
  DeviceSessionSendMessageResult,
  DeviceSessionSnapshot
} from '../../shared/protocol/types'

export interface ConnectionAdapter {
  readonly transport: 'tcp'
  openSession(options: DeviceSessionOpenOptions): Promise<DeviceSessionOpenResult>
  closeSession(options?: DeviceSessionCloseOptions): Promise<DeviceSessionCloseResult>
  sendMessage(options: DeviceSessionSendMessageOptions): Promise<DeviceSessionSendMessageResult>
  getSessionState(options?: DeviceSessionGetStateOptions): Promise<DeviceSessionSnapshot>
  pullHostEvents(): Promise<DeviceDiscoveryPullHostEventsResult>
}

export type ConnectionAdapterRegistry = {
  resolve(transport?: string): ConnectionAdapter
}

export function createConnectionAdapterRegistry(
  adapters: ConnectionAdapter[]
): ConnectionAdapterRegistry {
  const byTransport = new Map(adapters.map((adapter) => [adapter.transport, adapter]))
  return {
    resolve(transport = 'tcp') {
      const adapter = byTransport.get(transport as 'tcp')
      if (!adapter) {
        throw new Error(`Unsupported connection transport: ${transport}`)
      }
      return adapter
    }
  }
}
