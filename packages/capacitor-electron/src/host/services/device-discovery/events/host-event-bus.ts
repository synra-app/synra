import type {
  DeviceDiscoveryHostEvent,
  DeviceDiscoveryPullHostEventsResult
} from '../../../../shared/protocol/types'

export interface HostEventBus {
  publish(event: Omit<DeviceDiscoveryHostEvent, 'id' | 'timestamp'>): DeviceDiscoveryHostEvent
  drain(): DeviceDiscoveryPullHostEventsResult
  clear(): void
}

export function createHostEventBus(
  onHostEvent?: (event: DeviceDiscoveryHostEvent) => void
): HostEventBus {
  let nextId = 1
  const queue: DeviceDiscoveryHostEvent[] = []

  return {
    publish(input) {
      const event: DeviceDiscoveryHostEvent = {
        id: nextId,
        timestamp: Date.now(),
        ...input
      }
      nextId += 1
      queue.push(event)
      onHostEvent?.(event)
      return event
    },
    drain() {
      return { events: queue.splice(0, queue.length) }
    },
    clear() {
      queue.length = 0
    }
  }
}
