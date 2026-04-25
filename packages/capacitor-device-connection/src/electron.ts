import { WebPlugin, type ListenerCallback, type PluginListenerHandle } from '@capacitor/core'
import { isLanWireEventName } from '@synra/protocol'
import type {
  CloseTransportOptions,
  CloseTransportResult,
  DeviceConnectionPlugin,
  GetTransportStateOptions,
  GetTransportStateResult,
  HostEvent,
  LanWireEventReceivedEvent,
  MessageAckEvent,
  MessageReceivedEvent,
  OpenTransportOptions,
  OpenTransportResult,
  ProbeSynraPeersOptions,
  ProbeSynraPeersResult,
  PullHostEventsResult,
  SendLanEventOptions,
  SendLanEventResult,
  SendMessageOptions,
  SendMessageResult,
  TransportClosedEvent,
  TransportErrorEvent,
  TransportOpenedEvent
} from './definitions'
import {
  DEVICE_CONNECTION_TRANSPORT_ERROR_CODES,
  SYNRA_PROBE_EMBEDDED_IN_DISCOVERY
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
  'connection.openTransport': { payload: OpenTransportOptions; result: OpenTransportResult }
  'connection.closeTransport': { payload: CloseTransportOptions; result: CloseTransportResult }
  'connection.sendMessage': { payload: SendMessageOptions; result: SendMessageResult }
  'connection.sendLanEvent': { payload: SendLanEventOptions; result: SendLanEventResult }
  'connection.getTransportState': {
    payload: GetTransportStateOptions
    result: GetTransportStateResult
  }
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
                payload?: unknown
                requestId?: string
                event?: string
                from?: string
                target?: string
                replyRequestId?: string
              })
            : undefined
        const requestId =
          typeof envelope?.requestId === 'string' && envelope.requestId.length > 0
            ? envelope.requestId
            : undefined
        const from =
          typeof envelope?.from === 'string' && envelope.from.length > 0
            ? envelope.from
            : normalized.from
        const target =
          typeof envelope?.target === 'string' && envelope.target.length > 0
            ? envelope.target
            : normalized.target
        if (!requestId || !from || !target) {
          return
        }
        this.notifyListeners('messageReceived', {
          requestId,
          event: envelope?.event ?? normalized.event ?? normalized.type,
          from,
          target,
          replyRequestId: envelope?.replyRequestId ?? normalized.replyRequestId,
          payload: envelope?.payload ?? normalized.payload ?? null,
          timestamp: normalized.timestamp,
          transport: normalized.transport
        })
      } else if (normalized.type === 'transport.message.ack' && normalized.replyRequestId) {
        const payload =
          normalized.payload && typeof normalized.payload === 'object'
            ? (normalized.payload as { requestId?: string })
            : undefined
        if (!payload?.requestId || !normalized.target) {
          return
        }
        this.notifyListeners('messageAck', {
          requestId: payload.requestId,
          target: normalized.target,
          event: normalized.event,
          from: normalized.from,
          replyRequestId: normalized.replyRequestId,
          timestamp: normalized.timestamp,
          transport: normalized.transport
        })
      } else if (normalized.type === 'transport.opened') {
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
        this.notifyListeners('transportOpened', opened)
      } else if (
        normalized.type === 'transport.lan.event.received' &&
        normalized.payload &&
        typeof normalized.payload === 'object'
      ) {
        const pl = normalized.payload as {
          requestId?: unknown
          event?: unknown
          from?: unknown
          target?: unknown
          replyRequestId?: unknown
          payload?: unknown
        }
        if (
          typeof pl.requestId !== 'string' ||
          (typeof pl.from !== 'string' && typeof normalized.from !== 'string') ||
          (typeof pl.target !== 'string' && typeof normalized.target !== 'string')
        ) {
          return
        }
        const candidateEvent =
          typeof pl.event === 'string' && pl.event.length > 0 ? pl.event : (normalized.event ?? '')
        if (!isLanWireEventName(candidateEvent)) {
          return
        }
        this.notifyListeners('lanWireEventReceived', {
          requestId: pl.requestId,
          event: candidateEvent,
          from: typeof pl.from === 'string' ? pl.from : (normalized.from as string),
          target: typeof pl.target === 'string' ? pl.target : (normalized.target as string),
          replyRequestId:
            typeof pl.replyRequestId === 'string' ? pl.replyRequestId : normalized.replyRequestId,
          payload: pl.payload,
          timestamp: normalized.timestamp,
          transport: normalized.transport
        })
      } else if (normalized.type === 'transport.closed') {
        this.notifyListeners('transportClosed', {
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
          code:
            typeof normalized.code === 'string' && normalized.code.length > 0
              ? normalized.code
              : DEVICE_CONNECTION_TRANSPORT_ERROR_CODES.transportIoError,
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

  async openTransport(options: OpenTransportOptions): Promise<OpenTransportResult> {
    this.ensureHostEventSubscription()
    const result = await this.invokeBridge('connection.openTransport', options)
    this.notifyListeners('transportOpened', {
      deviceId: result.deviceId,
      transport: result.transport,
      direction: 'outbound',
      host: options.host,
      port: options.port
    })
    return result
  }

  async closeTransport(options: CloseTransportOptions = {}): Promise<CloseTransportResult> {
    this.ensureHostEventSubscription()
    const result = await this.invokeBridge('connection.closeTransport', options)
    this.notifyListeners('transportClosed', {
      deviceId: result.target,
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

  async getTransportState(
    options: GetTransportStateOptions = {}
  ): Promise<GetTransportStateResult> {
    this.ensureHostEventSubscription()
    return this.invokeBridge('connection.getTransportState', options)
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

  /**
   * Subscribe to main-process host events as soon as any listener is registered.
   * Otherwise inbound-only peers (no local openTransport/sendLanEvent yet) never receive
   * `transport.lan.event.received` in the renderer — e.g. iOS-initiated pairing.
   */
  addListener(
    eventName: 'transportOpened',
    listenerFunc: (event: TransportOpenedEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'transportClosed',
    listenerFunc: (event: TransportClosedEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'messageReceived',
    listenerFunc: (event: MessageReceivedEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'messageAck',
    listenerFunc: (event: MessageAckEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'transportError',
    listenerFunc: (event: TransportErrorEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'lanWireEventReceived',
    listenerFunc: (event: LanWireEventReceivedEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'hostEvent',
    listenerFunc: (event: HostEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(eventName: string, listenerFunc: ListenerCallback): Promise<PluginListenerHandle> {
    this.ensureHostEventSubscription()
    return super.addListener(eventName, listenerFunc)
  }
}
