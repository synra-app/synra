import type {
  DeviceDiscoveryStartOptions,
  DiscoveredDevice
} from '../../../../shared/protocol/types'

export type DiscoveryContext = {
  options: DeviceDiscoveryStartOptions
  timeoutMs: number
}

export interface DiscoveryStrategy {
  readonly kind: string
  discover(context: DiscoveryContext): Promise<DiscoveredDevice[]>
}
