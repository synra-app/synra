import type { DeviceDiscoveryHostEvent } from '../../../../shared/protocol/types'

export interface HostEventBus {
  publish(event: Omit<DeviceDiscoveryHostEvent, 'id' | 'timestamp'>): DeviceDiscoveryHostEvent
}

export function createHostEventBus(
  onHostEvent?: (event: DeviceDiscoveryHostEvent) => void
): HostEventBus {
  let nextId = 1

  return {
    publish(input) {
      const event: DeviceDiscoveryHostEvent = {
        id: nextId,
        timestamp: Date.now(),
        ...input
      }
      nextId += 1
      onHostEvent?.(event)
      return event
    }
  }
}
