import type { SynraCrossDeviceMessage } from '@synra/protocol'

export type TransportMode = 'lan' | 'relay'
export type TransportState = 'disconnected' | 'connecting' | 'connected'

export type TransportStatus = {
  state: TransportState
  mode: TransportMode | 'offline'
  lastError?: string
}

export type RetryPolicy = {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
}

export type AckResult = {
  acked: boolean
  attempts: number
}

export type DeviceTransport = {
  send(message: SynraCrossDeviceMessage): Promise<void>
  onMessage(handler: (message: SynraCrossDeviceMessage) => void): () => void | Promise<void>
  getStatus(): Promise<TransportStatus>
}

export type TransportErrorCode = 'TRANSPORT_DISCONNECTED' | 'TRANSPORT_UNREACHABLE'

export class TransportSendError extends Error {
  public readonly code: TransportErrorCode
  public readonly retryable: boolean

  public constructor(code: TransportErrorCode, message: string, retryable: boolean = true) {
    super(message)
    this.name = 'TransportSendError'
    this.code = code
    this.retryable = retryable
  }
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 2_000
}

export function getRetryDelayMs(
  attempt: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY
): number {
  if (attempt <= 0) {
    return 0
  }

  const delay = policy.baseDelayMs * 2 ** (attempt - 1)
  return Math.min(delay, policy.maxDelayMs)
}

export class MessageDeduper {
  private readonly expiresByMessageId = new Map<string, number>()

  constructor(private readonly dedupeWindowMs: number = 3 * 60 * 1_000) {}

  has(messageId: string, now: number = Date.now()): boolean {
    this.cleanup(now)
    return this.expiresByMessageId.has(messageId)
  }

  remember(messageId: string, now: number = Date.now()): void {
    this.cleanup(now)
    this.expiresByMessageId.set(messageId, now + this.dedupeWindowMs)
  }

  private cleanup(now: number): void {
    for (const [messageId, expiresAt] of this.expiresByMessageId.entries()) {
      if (expiresAt <= now) {
        this.expiresByMessageId.delete(messageId)
      }
    }
  }
}

type MessageHandler = (message: SynraCrossDeviceMessage) => void | Promise<void>

export type LoopbackTransportOptions = {
  dedupeWindowMs?: number
}

export class LoopbackDeviceTransport implements DeviceTransport {
  private readonly deduper: MessageDeduper
  private messageHandler: MessageHandler | null = null
  private peerTransport: LoopbackDeviceTransport | null = null
  private status: TransportStatus = {
    state: 'disconnected',
    mode: 'offline'
  }

  public constructor(options: LoopbackTransportOptions = {}) {
    this.deduper = new MessageDeduper(options.dedupeWindowMs)
  }

  public attachPeer(peerTransport: LoopbackDeviceTransport): void {
    this.peerTransport = peerTransport
    this.status = {
      state: 'connected',
      mode: 'lan'
    }
  }

  public detachPeer(): void {
    this.peerTransport = null
    this.status = {
      state: 'disconnected',
      mode: 'offline',
      lastError: 'Peer not attached.'
    }
  }

  public async send(message: SynraCrossDeviceMessage): Promise<void> {
    if (!this.peerTransport) {
      throw new TransportSendError(
        'TRANSPORT_DISCONNECTED',
        'Cannot send message while transport is disconnected.'
      )
    }

    if (!this.peerTransport.messageHandler) {
      throw new TransportSendError(
        'TRANSPORT_UNREACHABLE',
        'Cannot send message because peer listener is unavailable.'
      )
    }

    if (this.peerTransport.deduper.has(message.messageId)) {
      return
    }

    this.peerTransport.deduper.remember(message.messageId)
    await Promise.resolve(this.peerTransport.messageHandler(message))
  }

  public onMessage(handler: MessageHandler): () => void {
    this.messageHandler = handler
    return () => {
      if (this.messageHandler === handler) {
        this.messageHandler = null
      }
    }
  }

  public async getStatus(): Promise<TransportStatus> {
    return { ...this.status }
  }
}

export function createLoopbackTransportPair(
  options: LoopbackTransportOptions = {}
): [LoopbackDeviceTransport, LoopbackDeviceTransport] {
  const first = new LoopbackDeviceTransport(options)
  const second = new LoopbackDeviceTransport(options)
  first.attachPeer(second)
  second.attachPeer(first)
  return [first, second]
}
