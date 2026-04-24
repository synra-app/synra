import type {
  DeviceDiscoveryPullHostEventsResult,
  DeviceTransportCloseOptions,
  DeviceTransportCloseResult,
  DeviceTransportGetStateOptions,
  DeviceTransportOpenOptions,
  DeviceTransportOpenResult,
  DeviceTransportSendLanEventOptions,
  DeviceTransportSendLanEventResult,
  DeviceTransportSendMessageOptions,
  DeviceTransportSendMessageResult,
  DeviceTransportSnapshot
} from '../../shared/protocol/types'
import type { DeviceDiscoveryService } from './device-discovery.service'

export interface ConnectionService {
  openTransport(options: DeviceTransportOpenOptions): Promise<DeviceTransportOpenResult>
  closeTransport(options?: DeviceTransportCloseOptions): Promise<DeviceTransportCloseResult>
  sendMessage(options: DeviceTransportSendMessageOptions): Promise<DeviceTransportSendMessageResult>
  sendLanEvent(
    options: DeviceTransportSendLanEventOptions
  ): Promise<DeviceTransportSendLanEventResult>
  getTransportState(options?: DeviceTransportGetStateOptions): Promise<DeviceTransportSnapshot>
  pullHostEvents(): Promise<DeviceDiscoveryPullHostEventsResult>
}

function assertTcpTransport(transport: string): void {
  if (transport !== 'tcp') {
    throw new Error(`Unsupported connection transport: ${transport}`)
  }
}

export function createConnectionService(
  discoveryService: DeviceDiscoveryService
): ConnectionService {
  return {
    async openTransport(options) {
      const transport = options.transport ?? 'tcp'
      assertTcpTransport(transport)
      const result = await discoveryService.openTransport(options)
      return { ...result, transport: 'tcp' }
    },
    async closeTransport(options = {}) {
      const transport = options.transport ?? 'tcp'
      assertTcpTransport(transport)
      const result = await discoveryService.closeTransport(options)
      return { ...result, transport: 'tcp' }
    },
    async sendMessage(options) {
      const transport = options.transport ?? 'tcp'
      assertTcpTransport(transport)
      const result = await discoveryService.sendMessage(options)
      return { ...result, transport: 'tcp' }
    },
    async sendLanEvent(options) {
      const transport = options.transport ?? 'tcp'
      assertTcpTransport(transport)
      const result = await discoveryService.sendLanEvent(options)
      return { ...result, transport: 'tcp' }
    },
    async getTransportState(options = {}) {
      const transport = options.transport ?? 'tcp'
      assertTcpTransport(transport)
      const result = await discoveryService.getTransportState(options)
      return { ...result, transport: 'tcp' }
    },
    async pullHostEvents() {
      return discoveryService.pullHostEvents()
    }
  }
}
