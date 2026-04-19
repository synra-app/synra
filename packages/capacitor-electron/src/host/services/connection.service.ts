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
import type { DeviceDiscoveryService } from './device-discovery.service'
import {
  createConnectionAdapterRegistry,
  type ConnectionAdapter,
  type ConnectionAdapterRegistry
} from './connection-adapter.registry'

export interface ConnectionService {
  openSession(options: DeviceSessionOpenOptions): Promise<DeviceSessionOpenResult>
  closeSession(options?: DeviceSessionCloseOptions): Promise<DeviceSessionCloseResult>
  sendMessage(options: DeviceSessionSendMessageOptions): Promise<DeviceSessionSendMessageResult>
  getSessionState(options?: DeviceSessionGetStateOptions): Promise<DeviceSessionSnapshot>
  pullHostEvents(): Promise<DeviceDiscoveryPullHostEventsResult>
}

function createTcpConnectionAdapter(discoveryService: DeviceDiscoveryService): ConnectionAdapter {
  return {
    transport: 'tcp',
    async openSession(options) {
      const result = await discoveryService.openSession(options)
      return { ...result, transport: 'tcp' }
    },
    async closeSession(options) {
      const result = await discoveryService.closeSession(options)
      return { ...result, transport: 'tcp' }
    },
    async sendMessage(options) {
      const result = await discoveryService.sendMessage(options)
      return { ...result, transport: 'tcp' }
    },
    async getSessionState(options) {
      const result = await discoveryService.getSessionState(options)
      return { ...result, transport: 'tcp' }
    },
    async pullHostEvents() {
      return discoveryService.pullHostEvents()
    }
  }
}

export function createConnectionService(
  discoveryService: DeviceDiscoveryService,
  registry: ConnectionAdapterRegistry = createConnectionAdapterRegistry([
    createTcpConnectionAdapter(discoveryService)
  ])
): ConnectionService {
  return {
    async openSession(options) {
      return registry.resolve(options.transport).openSession(options)
    },
    async closeSession(options = {}) {
      return registry.resolve(options.transport).closeSession(options)
    },
    async sendMessage(options) {
      return registry.resolve(options.transport).sendMessage(options)
    },
    async getSessionState(options = {}) {
      return registry.resolve(options.transport).getSessionState(options)
    },
    async pullHostEvents() {
      return registry.resolve('tcp').pullHostEvents()
    }
  }
}
