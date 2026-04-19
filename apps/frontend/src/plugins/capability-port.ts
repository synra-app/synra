import { LanDiscovery, type MessageReceivedEvent } from '@synra/capacitor-lan-discovery'
import type { HostCapabilityPort } from '@synra/plugin-sdk'
import type { SynraCrossDeviceMessage, SynraMessageType } from '@synra/protocol'

type Unsubscribe = () => void | Promise<void>

function createTraceId(): string {
  return `trace-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export class CapacitorCapabilityPortAdapter implements HostCapabilityPort {
  private readonly listenerCleanup = new Set<Unsubscribe>()

  async sendCrossDeviceMessage<TType extends SynraMessageType>(
    message: SynraCrossDeviceMessage<TType>
  ): Promise<void> {
    await LanDiscovery.sendMessage({
      sessionId: message.sessionId,
      messageId: message.messageId,
      messageType: message.type,
      payload: message.payload
    })
  }

  subscribeCrossDeviceMessage<TType extends SynraMessageType>(
    type: TType,
    handler: (message: SynraCrossDeviceMessage<TType>) => void | Promise<void>
  ): () => void {
    let removed = false
    let listener: { remove: () => Promise<void> } | undefined
    void LanDiscovery.addListener('messageReceived', (event: MessageReceivedEvent) => {
      if (removed || event.messageType !== type) {
        return
      }
      const message: SynraCrossDeviceMessage<TType> = {
        protocolVersion: '1.0',
        messageId: event.messageId ?? `generated-${Date.now()}`,
        sessionId: event.sessionId,
        traceId: createTraceId(),
        type,
        sentAt: event.timestamp,
        ttlMs: 60_000,
        fromDeviceId: 'remote-device',
        toDeviceId: 'current-device',
        payload: event.payload as SynraCrossDeviceMessage<TType>['payload']
      }
      void Promise.resolve(handler(message))
    }).then((handle) => {
      listener = handle
    })

    const cleanup = () => {
      removed = true
      if (listener) {
        return listener.remove()
      }
      return undefined
    }
    this.listenerCleanup.add(cleanup)
    return () => {
      this.listenerCleanup.delete(cleanup)
      void cleanup()
    }
  }

  dispose(): void {
    for (const cleanup of this.listenerCleanup) {
      void cleanup()
    }
    this.listenerCleanup.clear()
  }
}
