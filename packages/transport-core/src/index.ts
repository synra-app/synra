import type { SynraCrossDeviceMessage } from "@synra/protocol";

export type TransportMode = "lan" | "relay";
export type TransportState = "disconnected" | "connecting" | "connected";

export type TransportStatus = {
  state: TransportState;
  mode: TransportMode | "offline";
  lastError?: string;
};

export type RetryPolicy = {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

export type AckResult = {
  acked: boolean;
  attempts: number;
};

export type DeviceTransport = {
  send(message: SynraCrossDeviceMessage): Promise<void>;
  onMessage(handler: (message: SynraCrossDeviceMessage) => void): () => void | Promise<void>;
  getStatus(): Promise<TransportStatus>;
};

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 2_000,
};

export function getRetryDelayMs(
  attempt: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): number {
  if (attempt <= 0) {
    return 0;
  }

  const delay = policy.baseDelayMs * 2 ** (attempt - 1);
  return Math.min(delay, policy.maxDelayMs);
}

export class MessageDeduper {
  private readonly expiresByMessageId = new Map<string, number>();

  constructor(private readonly dedupeWindowMs: number = 3 * 60 * 1_000) {}

  has(messageId: string, now: number = Date.now()): boolean {
    this.cleanup(now);
    return this.expiresByMessageId.has(messageId);
  }

  remember(messageId: string, now: number = Date.now()): void {
    this.cleanup(now);
    this.expiresByMessageId.set(messageId, now + this.dedupeWindowMs);
  }

  private cleanup(now: number): void {
    for (const [messageId, expiresAt] of this.expiresByMessageId.entries()) {
      if (expiresAt <= now) {
        this.expiresByMessageId.delete(messageId);
      }
    }
  }
}
