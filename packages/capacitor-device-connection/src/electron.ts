import { WebPlugin } from '@capacitor/core'
import type {
  CloseSessionOptions,
  CloseSessionResult,
  GetSessionStateOptions,
  GetSessionStateResult,
  HostEvent,
  OpenSessionOptions,
  OpenSessionResult,
  PullHostEventsResult,
  SendMessageOptions,
  SendMessageResult,
  DeviceConnectionPlugin
} from './definitions'

type ElectronBridgeTarget = {
  __synraCapElectron?: {
    invoke?: BridgeInvoke
    onHostEvent?: (listener: (event: HostEvent) => void) => () => void
  }
}

type BridgeInvoke = (
  method: string,
  payload: unknown,
  options?: { timeoutMs?: number; signal?: AbortSignal }
) => Promise<unknown>

type ConnectionBridgeMethods = {
  'connection.openSession': { payload: OpenSessionOptions; result: OpenSessionResult }
  'connection.closeSession': { payload: CloseSessionOptions; result: CloseSessionResult }
  'connection.sendMessage': { payload: SendMessageOptions; result: SendMessageResult }
  'connection.getSessionState': { payload: GetSessionStateOptions; result: GetSessionStateResult }
  'connection.pullHostEvents': { payload: Record<string, never>; result: PullHostEventsResult }
}

export class DeviceConnectionElectron extends WebPlugin implements DeviceConnectionPlugin {
  private invoke: BridgeInvoke | undefined
  private hostEventSubscribed = false

  private resolveInvoke(): BridgeInvoke {
    if (this.invoke) {
      return this.invoke
    }

    const target = globalThis as unknown as ElectronBridgeTarget
    const invoke = target.__synraCapElectron?.invoke
    if (!invoke) {
      throw this.unavailable('Electron bridge is unavailable.')
    }

    this.invoke = invoke
    return invoke
  }

  private ensureHostEventSubscription(): void {
    if (this.hostEventSubscribed) {
      return
    }

    const target = globalThis as unknown as ElectronBridgeTarget
    const subscribe = target.__synraCapElectron?.onHostEvent
    if (!subscribe) {
      return
    }

    subscribe((event) => {
      if (!event.type.startsWith('transport.')) {
        return
      }
      const normalized = {
        ...event,
        transport: event.transport ?? 'tcp'
      } satisfies HostEvent
      this.notifyListeners('hostEvent', normalized)
      if (normalized.type === 'transport.message.received' && normalized.sessionId) {
        const envelope =
          normalized.payload && typeof normalized.payload === 'object'
            ? (normalized.payload as { messageType?: string; payload?: unknown })
            : undefined
        this.notifyListeners('messageReceived', {
          sessionId: normalized.sessionId,
          messageId: normalized.messageId,
          messageType: (normalized.messageType ??
            envelope?.messageType ??
            'transport.message.received') as SendMessageOptions['messageType'],
          payload: envelope?.payload ?? normalized.payload ?? null,
          timestamp: normalized.timestamp,
          transport: normalized.transport
        })
      } else if (
        normalized.type === 'transport.message.ack' &&
        normalized.sessionId &&
        normalized.messageId
      ) {
        this.notifyListeners('messageAck', {
          sessionId: normalized.sessionId,
          messageId: normalized.messageId,
          timestamp: normalized.timestamp,
          transport: normalized.transport
        })
      } else if (normalized.type === 'transport.session.opened' && normalized.sessionId) {
        this.notifyListeners('sessionOpened', {
          sessionId: normalized.sessionId,
          transport: normalized.transport
        })
      } else if (normalized.type === 'transport.session.closed') {
        this.notifyListeners('sessionClosed', {
          sessionId: normalized.sessionId,
          reason: 'peer-closed',
          transport: normalized.transport
        })
      } else if (normalized.type === 'transport.error') {
        const message =
          typeof normalized.payload === 'string'
            ? normalized.payload
            : normalized.payload &&
                typeof normalized.payload === 'object' &&
                'message' in normalized.payload
              ? JSON.stringify(
                  (normalized.payload as { message?: unknown }).message ?? 'Transport error'
                )
              : 'Transport error'
        this.notifyListeners('transportError', {
          sessionId: normalized.sessionId,
          code: normalized.code,
          message,
          transport: normalized.transport
        })
      }
    })
    this.hostEventSubscribed = true
  }

  private async invokeBridge<TMethod extends keyof ConnectionBridgeMethods>(
    method: TMethod,
    payload: ConnectionBridgeMethods[TMethod]['payload']
  ): Promise<ConnectionBridgeMethods[TMethod]['result']> {
    const invoke = this.resolveInvoke()
    return invoke(method, payload) as Promise<ConnectionBridgeMethods[TMethod]['result']>
  }

  async openSession(options: OpenSessionOptions): Promise<OpenSessionResult> {
    this.ensureHostEventSubscription()
    const result = await this.invokeBridge('connection.openSession', options)
    this.notifyListeners('sessionOpened', {
      sessionId: result.sessionId,
      transport: result.transport,
      deviceId: options.deviceId,
      host: options.host,
      port: options.port
    })
    return result
  }

  async closeSession(options: CloseSessionOptions = {}): Promise<CloseSessionResult> {
    this.ensureHostEventSubscription()
    const result = await this.invokeBridge('connection.closeSession', options)
    this.notifyListeners('sessionClosed', {
      sessionId: result.sessionId,
      reason: 'closed-by-client',
      transport: result.transport
    })
    return result
  }

  async sendMessage(options: SendMessageOptions): Promise<SendMessageResult> {
    this.ensureHostEventSubscription()
    return this.invokeBridge('connection.sendMessage', options)
  }

  async getSessionState(options: GetSessionStateOptions = {}): Promise<GetSessionStateResult> {
    this.ensureHostEventSubscription()
    return this.invokeBridge('connection.getSessionState', options)
  }

  async pullHostEvents(): Promise<PullHostEventsResult> {
    this.ensureHostEventSubscription()
    return this.invokeBridge('connection.pullHostEvents', {})
  }
}
