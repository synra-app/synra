import {
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_SUPPORTED_PROTOCOL_VERSIONS
} from '../../shared/protocol/constants'
import type { RuntimeInfo } from '../../shared/protocol/types'

export type RuntimeInfoServiceOptions = {
  capacitorVersion?: string
  electronVersion?: string
  capabilities?: string[]
}

export function createRuntimeInfoService(options: RuntimeInfoServiceOptions = {}) {
  return {
    async getRuntimeInfo(): Promise<RuntimeInfo> {
      return {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        supportedProtocolVersions: [...BRIDGE_SUPPORTED_PROTOCOL_VERSIONS],
        capacitorVersion: options.capacitorVersion ?? 'unknown',
        electronVersion: options.electronVersion ?? process.versions.electron ?? 'unknown',
        nodeVersion: process.versions.node,
        platform: process.platform,
        capabilities: options.capabilities ?? [
          'runtime.getInfo',
          'runtime.resolveActions',
          'runtime.execute',
          'plugin.catalog.get',
          'external.open',
          'file.read',
          'discovery.start',
          'discovery.stop',
          'discovery.list',
          'discovery.pair',
          'discovery.probeConnectable',
          'discovery.openSession',
          'discovery.closeSession',
          'discovery.sendMessage',
          'discovery.getSessionState',
          'discovery.pullHostEvents'
        ]
      }
    }
  }
}
