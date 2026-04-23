import { WebPlugin } from '@capacitor/core'
import type {
  CloseSessionOptions,
  CloseSessionResult,
  GetSessionStateOptions,
  GetSessionStateResult,
  HostEvent,
  OpenSessionOptions,
  OpenSessionResult,
  ProbeSynraPeersOptions,
  ProbeSynraPeersResult,
  PullHostEventsResult,
  SendLanEventOptions,
  SendLanEventResult,
  SendMessageOptions,
  SendMessageResult,
  DeviceConnectionPlugin
} from './definitions'
import { SYNRA_PROBE_EMBEDDED_IN_DISCOVERY } from './definitions'

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
  'connection.sendLanEvent': { payload: SendLanEventOptions; result: SendLanEventResult }
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
      const isSupportedHostEvent =
        event.type.startsWith('transport.') ||
        event.type.startsWith('host.') ||
        event.type.startsWith('election.')
      if (!isSupportedHostEvent) {
        return
      }
      const normalized = {
        ...event,
        transport: event.transport ?? 'tcp'
      } satisfies HostEvent
      this.notifyListeners('hostEvent', normalized)
      if (normalized.type === 'transport.message.received') {
        const envelope =
          normalized.payload && typeof normalized.payload === 'object'
            ? (normalized.payload as {
                messageType?: string
                payload?: unknown
                requestId?: string
                sourceDeviceId?: string
                targetDeviceId?: string
                replyToRequestId?: string
              })
            : undefined
        if (!envelope?.requestId || !envelope.sourceDeviceId || !envelope.targetDeviceId) {
          return
        }
        this.notifyListeners('messageReceived', {
          requestId: envelope.requestId,
          sourceDeviceId: envelope.sourceDeviceId,
          targetDeviceId: envelope.targetDeviceId,
          replyToRequestId: envelope.replyToRequestId,
          messageId: normalized.messageId,
          messageType: (normalized.messageType ??
            envelope?.messageType ??
            'transport.message.received') as SendMessageOptions['messageType'],
          payload: envelope?.payload ?? normalized.payload ?? null,
          timestamp: normalized.timestamp,
          transport: normalized.transport
        })
      } else if (normalized.type === 'transport.message.ack' && normalized.messageId) {
        const payload =
          normalized.payload && typeof normalized.payload === 'object'
            ? (normalized.payload as { requestId?: string; targetDeviceId?: string })
            : undefined
        if (!payload?.requestId || !payload.targetDeviceId) {
          return
        }
        this.notifyListeners('messageAck', {
          requestId: payload.requestId,
          targetDeviceId: payload.targetDeviceId,
          messageId: normalized.messageId,
          timestamp: normalized.timestamp,
          transport: normalized.transport
        })
      } else if (normalized.type === 'transport.session.opened') {
        const payload =
          normalized.payload && typeof normalized.payload === 'object'
            ? (normalized.payload as {
                deviceId?: string
                direction?: 'inbound' | 'outbound'
                host?: string
                port?: number
                displayName?: string
                incomingSynraConnectPayload?: Record<string, unknown>
                connectAckPayload?: Record<string, unknown>
              })
            : undefined
        const displayName =
          typeof payload?.displayName === 'string' && payload.displayName.trim().length > 0
            ? payload.displayName.trim()
            : undefined
        const opened: Record<string, unknown> = {
          transport: normalized.transport,
          deviceId: payload?.deviceId,
          direction: payload?.direction,
          host: payload?.host,
          port: payload?.port,
          displayName
        }
        if (
          payload?.incomingSynraConnectPayload &&
          typeof payload.incomingSynraConnectPayload === 'object'
        ) {
          opened.incomingSynraConnectPayload = payload.incomingSynraConnectPayload
        }
        if (payload?.connectAckPayload && typeof payload.connectAckPayload === 'object') {
          opened.connectAckPayload = payload.connectAckPayload
        }
        this.notifyListeners('sessionOpened', opened)
      } else if (
        normalized.type === 'transport.lan.event.received' &&
        normalized.payload &&
        typeof normalized.payload === 'object'
      ) {
        const pl = normalized.payload as {
          requestId?: unknown
          sourceDeviceId?: unknown
          targetDeviceId?: unknown
          replyToRequestId?: unknown
          eventName?: unknown
          eventPayload?: unknown
        }
        if (
          typeof pl.requestId !== 'string' ||
          typeof pl.sourceDeviceId !== 'string' ||
          typeof pl.targetDeviceId !== 'string'
        ) {
          return
        }
        const eventName = typeof pl.eventName === 'string' ? pl.eventName : ''
        this.notifyListeners('lanWireEventReceived', {
          requestId: pl.requestId,
          sourceDeviceId: pl.sourceDeviceId,
          targetDeviceId: pl.targetDeviceId,
          replyToRequestId:
            typeof pl.replyToRequestId === 'string' ? pl.replyToRequestId : undefined,
          eventName,
          eventPayload: pl.eventPayload,
          transport: normalized.transport
        })
      } else if (normalized.type === 'transport.session.closed') {
        this.notifyListeners('sessionClosed', {
          deviceId: normalized.deviceId,
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
          deviceId: normalized.deviceId,
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
      deviceId: result.deviceId,
      transport: result.transport,
      direction: 'outbound',
      host: options.host,
      port: options.port
    })
    return result
  }

  async closeSession(options: CloseSessionOptions = {}): Promise<CloseSessionResult> {
    this.ensureHostEventSubscription()
    const result = await this.invokeBridge('connection.closeSession', options)
    this.notifyListeners('sessionClosed', {
      deviceId: result.targetDeviceId,
      reason: 'closed-by-client',
      transport: result.transport
    })
    return result
  }

  async sendMessage(options: SendMessageOptions): Promise<SendMessageResult> {
    this.ensureHostEventSubscription()
    return this.invokeBridge('connection.sendMessage', options)
  }

  async sendLanEvent(options: SendLanEventOptions): Promise<SendLanEventResult> {
    this.ensureHostEventSubscription()
    return this.invokeBridge('connection.sendLanEvent', options)
  }

  async getSessionState(options: GetSessionStateOptions = {}): Promise<GetSessionStateResult> {
    this.ensureHostEventSubscription()
    return this.invokeBridge('connection.getSessionState', options)
  }

  async pullHostEvents(): Promise<PullHostEventsResult> {
    this.ensureHostEventSubscription()
    return this.invokeBridge('connection.pullHostEvents', {})
  }

  async probeSynraPeers(options: ProbeSynraPeersOptions): Promise<ProbeSynraPeersResult> {
    this.ensureHostEventSubscription()
    const portDefault = 32100
    return {
      results: options.targets.map((target) => ({
        host: target.host,
        port: typeof target.port === 'number' && target.port > 0 ? target.port : portDefault,
        ok: false,
        error: SYNRA_PROBE_EMBEDDED_IN_DISCOVERY
      }))
    }
  }
}
