import type {
  DeviceDiscoveryPullHostEventsResult,
  DeviceSessionCloseOptions,
  DeviceSessionCloseResult,
  DeviceSessionGetStateOptions,
  DeviceSessionOpenOptions,
  DeviceSessionOpenResult,
  DeviceSessionSendLanEventOptions,
  DeviceSessionSendLanEventResult,
  DeviceSessionSendMessageOptions,
  DeviceSessionSendMessageResult,
  DeviceSessionSnapshot
} from '../../shared/protocol/types'
import type { DeviceDiscoveryService } from './device-discovery.service'

export interface ConnectionService {
  openSession(options: DeviceSessionOpenOptions): Promise<DeviceSessionOpenResult>
  closeSession(options?: DeviceSessionCloseOptions): Promise<DeviceSessionCloseResult>
  sendMessage(options: DeviceSessionSendMessageOptions): Promise<DeviceSessionSendMessageResult>
  sendLanEvent(options: DeviceSessionSendLanEventOptions): Promise<DeviceSessionSendLanEventResult>
  getSessionState(options?: DeviceSessionGetStateOptions): Promise<DeviceSessionSnapshot>
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
    async openSession(options) {
      const transport = options.transport ?? 'tcp'
      assertTcpTransport(transport)
      const result = await discoveryService.openSession(options)
      return { ...result, transport: 'tcp' }
    },
    async closeSession(options = {}) {
      const transport = options.transport ?? 'tcp'
      assertTcpTransport(transport)
      const result = await discoveryService.closeSession(options)
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
    async getSessionState(options = {}) {
      const transport = options.transport ?? 'tcp'
      assertTcpTransport(transport)
      const result = await discoveryService.getSessionState(options)
      return { ...result, transport: 'tcp' }
    },
    async pullHostEvents() {
      return discoveryService.pullHostEvents()
    }
  }
}
