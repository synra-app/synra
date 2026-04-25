import { PAIRED_RECONNECT_DELAYS_MS, PAIRED_RECONNECT_MAX_FAILURES } from './paired-reconnect'

export type TryConnectPaired = (deviceId: string) => Promise<boolean>

type PairedReconnectSchedulerOptions = {
  isTransportReady: (deviceId: string) => boolean
  tryConnect: TryConnectPaired
  onGaveUp: (deviceId: string) => void
  onCleared: (deviceId: string) => void
}

/**
 * Backs off 3s / 5s / 10s over three connect attempts, then gives up.
 */
export class PairedReconnectScheduler {
  private readonly isTransportReady: (deviceId: string) => boolean
  private readonly tryConnect: TryConnectPaired
  private readonly onGaveUp: (deviceId: string) => void
  private readonly onCleared: (deviceId: string) => void
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly inFlight = new Set<string>()
  private readonly failureCount = new Map<string, number>()

  constructor(options: PairedReconnectSchedulerOptions) {
    this.isTransportReady = options.isTransportReady
    this.tryConnect = options.tryConnect
    this.onGaveUp = options.onGaveUp
    this.onCleared = options.onCleared
  }

  private clearTimer(deviceId: string): void {
    const t = this.timers.get(deviceId)
    if (t !== undefined) {
      clearTimeout(t)
      this.timers.delete(deviceId)
    }
  }

  private scheduleAttempt(deviceId: string, failureSoFar: number): void {
    this.clearTimer(deviceId)
    if (failureSoFar >= PAIRED_RECONNECT_MAX_FAILURES) {
      this.onGaveUp(deviceId)
      return
    }
    const delay = PAIRED_RECONNECT_DELAYS_MS[failureSoFar]
    this.timers.set(
      deviceId,
      setTimeout(() => {
        this.timers.delete(deviceId)
        void this.runAttempt(deviceId, failureSoFar)
      }, delay)
    )
  }

  private async runAttempt(deviceId: string, failureSoFar: number): Promise<void> {
    if (this.isTransportReady(deviceId)) {
      this.onBecameReady(deviceId)
      return
    }
    if (this.inFlight.has(deviceId)) {
      return
    }
    this.inFlight.add(deviceId)
    try {
      const ok = await this.tryConnect(deviceId)
      if (this.isTransportReady(deviceId) || ok) {
        this.onBecameReady(deviceId)
        return
      }
      const next = failureSoFar + 1
      this.failureCount.set(deviceId, next)
      if (next >= PAIRED_RECONNECT_MAX_FAILURES) {
        this.onGaveUp(deviceId)
        return
      }
      this.scheduleAttempt(deviceId, next)
    } finally {
      this.inFlight.delete(deviceId)
    }
  }

  /**
   * Transport became ready: stop timers and clear counters for that peer.
   */
  onBecameReady(deviceId: string): void {
    this.clearTimer(deviceId)
    this.failureCount.delete(deviceId)
    this.inFlight.delete(deviceId)
    this.onCleared(deviceId)
  }

  /**
   * A paired device was transport-ready and no longer is: start first delayed attempt
   * unless auto-reconnect is considered exhausted (caller skips if gave up).
   */
  onBecameNotReadyShouldSchedule(deviceId: string, isGaveUp: boolean): void {
    if (isGaveUp) {
      return
    }
    this.clearTimer(deviceId)
    this.failureCount.set(deviceId, 0)
    this.scheduleAttempt(deviceId, 0)
  }

  /**
   * After manual Connect reset: treat like a new loss and run the backoff schedule if still not ready.
   */
  restartAfterManualIfStillDisconnected(deviceId: string, isGaveUp: boolean): void {
    this.onBecameReady(deviceId)
    if (this.isTransportReady(deviceId)) {
      return
    }
    this.onBecameNotReadyShouldSchedule(deviceId, isGaveUp)
  }

  unpairOrForget(deviceId: string): void {
    this.clearTimer(deviceId)
    this.failureCount.delete(deviceId)
    this.inFlight.delete(deviceId)
    this.onCleared(deviceId)
  }

  destroy(): void {
    for (const id of this.timers.keys()) {
      this.clearTimer(id)
    }
    this.timers.clear()
    this.inFlight.clear()
    this.failureCount.clear()
  }
}
