import type { DiscoveredDevice } from '../../../../../shared/protocol/types'
import { toManualDevices } from '../../core/device-mapper'
import type { DiscoveryContext, DiscoveryStrategy } from '../discovery-strategy'

export function createManualDiscoveryStrategy(): DiscoveryStrategy {
  return {
    kind: 'manual',
    async discover(context: DiscoveryContext): Promise<DiscoveredDevice[]> {
      const targets = context.options.manualTargets ?? []
      return toManualDevices(targets)
    }
  }
}
