import {
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_SUPPORTED_PROTOCOL_VERSIONS,
  type RuntimeInfo
} from '@synra/bridge-schema'
import { pickPrimarySourceHostIp } from './device-discovery/core/network'

export type RuntimeInfoServiceOptions = {
  capacitorVersion?: string
  electronVersion?: string
  capabilities?: string[]
}

export function createRuntimeInfoService(options: RuntimeInfoServiceOptions = {}) {
  return {
    async getRuntimeInfo(): Promise<RuntimeInfo> {
      const primaryDiscoveryIpv4 = pickPrimarySourceHostIp()
      return {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        supportedProtocolVersions: [...BRIDGE_SUPPORTED_PROTOCOL_VERSIONS],
        capacitorVersion: options.capacitorVersion ?? 'unknown',
        electronVersion: options.electronVersion ?? process.versions.electron ?? 'unknown',
        nodeVersion: process.versions.node,
        platform: process.platform,
        ...(primaryDiscoveryIpv4 ? { primaryDiscoveryIpv4 } : {}),
        capabilities: options.capabilities ?? [
          'runtime.getInfo',
          'runtime.resolveActions',
          'runtime.execute',
          'plugin.catalog.get',
          'plugin.install',
          'plugin.installLocal',
          'plugin.uninstall',
          'plugin.listInstalled',
          'plugin.registerInstalled',
          'plugin.syncToDevice',
          'external.open',
          'clipboard.read',
          'file.read',
          'discovery.start',
          'discovery.stop',
          'discovery.list',
          'connection.openTransport',
          'connection.closeTransport',
          'connection.sendMessage',
          'connection.sendLanEvent',
          'connection.getTransportState',
          'preferences.get',
          'preferences.set',
          'preferences.remove',
          'apps.listInstalled',
          'apps.launch'
        ]
      }
    }
  }
}
