/**
 * Cancels in-flight mobile reverse TCP handoffs (LanDiscovery inbound → DeviceConnection outbound)
 * using a per-hostKey generation counter. Does not cancel native Capacitor calls; stale completions
 * must check {@link HandoffCoordinator.isTicketStale} before side effects (e.g. closing Lan inbound).
 */
export class HandoffCoordinator {
  private readonly generationByHostKey = new Map<string, number>()
  private readonly inboundLanSessionToHostKey = new Map<string, string>()

  /** Increment generation for each key (invalidates any in-flight handoff using that key). */
  invalidateHostKeys(keys: Iterable<string>): void {
    for (const key of keys) {
      this.bump(key)
    }
  }

  /**
   * Before closing a session natively, bump handoff generation for the relevant host so any
   * concurrent reverse openSession is treated as stale.
   */
  bumpForClosingSession(
    sessionId: string | undefined,
    resolveHostKey: (sessionId: string) => string | undefined
  ): void {
    if (!sessionId) {
      return
    }
    const fromInbound = this.inboundLanSessionToHostKey.get(sessionId)
    if (fromInbound) {
      this.bump(fromInbound)
      return
    }
    const fromMeta = resolveHostKey(sessionId)
    if (fromMeta) {
      this.bump(fromMeta)
    }
  }

  registerInboundLanSession(sessionId: string, hostKey: string): void {
    this.inboundLanSessionToHostKey.set(sessionId, hostKey)
  }

  clearInboundLanSession(sessionId: string): void {
    this.inboundLanSessionToHostKey.delete(sessionId)
  }

  /** Start a new handoff ticket for this host; returns ticket to pass into the async runner. */
  beginHandoffTicket(hostKey: string): number {
    return this.bump(hostKey)
  }

  isTicketStale(hostKey: string, ticket: number): boolean {
    return (this.generationByHostKey.get(hostKey) ?? 0) !== ticket
  }

  private bump(hostKey: string): number {
    const next = (this.generationByHostKey.get(hostKey) ?? 0) + 1
    this.generationByHostKey.set(hostKey, next)
    return next
  }
}
