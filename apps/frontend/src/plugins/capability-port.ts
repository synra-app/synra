import type { HostCapabilityPort } from '@synra/plugin-sdk'
import { useConnection } from '@synra/hooks'
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
    const { sendMessage, ensureListeners } = useConnection()
    await ensureListeners()
    await sendMessage({
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
    const { onMessage } = useConnection()
    const cleanup = onMessage(
      (event) => {
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
      },
      { messageType: type }
    )

    this.listenerCleanup.add(cleanup)
    return () => {
      this.listenerCleanup.delete(cleanup)
      cleanup()
    }
  }

  dispose(): void {
    for (const cleanup of this.listenerCleanup) {
      void cleanup()
    }
    this.listenerCleanup.clear()
  }
}
