import { type Ref } from 'vue'
import type { SynraHookConnectedSession } from '../types'
import { CONNECTED_SESSIONS_REBUILD_DEBOUNCE_MS, MAX_CLOSED_CONNECTED_SESSIONS } from './constants'

export class ConnectedSessionsBook {
  private readonly connectedSessionMap = new Map<string, SynraHookConnectedSession>()
  private connectedSessionsRebuildTimer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly connectedSessions: Ref<SynraHookConnectedSession[]>) {}

  private sessionSortValue(session: SynraHookConnectedSession): number {
    return Number(session.lastActiveAt ?? session.closedAt ?? session.openedAt ?? 0)
  }

  private pruneClosedSessions(entries: SynraHookConnectedSession[]): SynraHookConnectedSession[] {
    if (entries.length <= MAX_CLOSED_CONNECTED_SESSIONS) {
      return entries
    }
    return entries.slice(0, MAX_CLOSED_CONNECTED_SESSIONS)
  }

  rebuildConnectedSessionsView(): void {
    const openSessions: SynraHookConnectedSession[] = []
    const closedSessions: SynraHookConnectedSession[] = []

    for (const item of this.connectedSessionMap.values()) {
      if (item.status === 'open') {
        openSessions.push(item)
      } else {
        closedSessions.push(item)
      }
    }

    openSessions.sort((left, right) => this.sessionSortValue(right) - this.sessionSortValue(left))
    closedSessions.sort((left, right) => this.sessionSortValue(right) - this.sessionSortValue(left))
    const retainedClosedSessions = this.pruneClosedSessions(closedSessions)
    const nextView = [...openSessions, ...retainedClosedSessions]

    this.connectedSessions.value = nextView

    const retainedIds = new Set(nextView.map((item) => item.sessionId))
    for (const sessionId of this.connectedSessionMap.keys()) {
      if (!retainedIds.has(sessionId)) {
        this.connectedSessionMap.delete(sessionId)
      }
    }
  }

  scheduleConnectedSessionsRebuild(immediate = false): void {
    if (immediate) {
      if (this.connectedSessionsRebuildTimer) {
        clearTimeout(this.connectedSessionsRebuildTimer)
        this.connectedSessionsRebuildTimer = undefined
      }
      this.rebuildConnectedSessionsView()
      return
    }

    if (this.connectedSessionsRebuildTimer) {
      return
    }

    this.connectedSessionsRebuildTimer = setTimeout(() => {
      this.connectedSessionsRebuildTimer = undefined
      this.rebuildConnectedSessionsView()
    }, CONNECTED_SESSIONS_REBUILD_DEBOUNCE_MS)
  }

  upsertConnectedSession(
    next: SynraHookConnectedSession,
    options: { immediate?: boolean } = {}
  ): void {
    const current = this.connectedSessionMap.get(next.sessionId)
    this.connectedSessionMap.set(
      next.sessionId,
      current
        ? {
            ...current,
            ...next
          }
        : next
    )
    this.scheduleConnectedSessionsRebuild(Boolean(options.immediate))
  }

  markConnectionClosed(sessionId: string | undefined, reasonAt: number): void {
    if (!sessionId) {
      return
    }
    const current = this.connectedSessionMap.get(sessionId)
    if (!current) {
      return
    }
    this.upsertConnectedSession(
      {
        ...current,
        status: 'closed',
        closedAt: reasonAt,
        lastActiveAt: reasonAt
      },
      { immediate: true }
    )
  }

  touchSessionActivity(
    sessionId: string,
    updatedAt: number,
    fallbackDirection: 'inbound' | 'outbound'
  ): void {
    const existing = this.connectedSessionMap.get(sessionId)
    if (!existing) {
      return
    }
    this.upsertConnectedSession({
      ...existing,
      status: 'open',
      lastActiveAt: updatedAt,
      direction: existing.direction ?? fallbackDirection
    })
  }

  findOpenSessionIdsByHostDirection(
    host: string,
    direction: 'inbound' | 'outbound',
    excludeSessionId?: string
  ): string[] {
    const matched: string[] = []
    for (const session of this.connectedSessionMap.values()) {
      if (session.status !== 'open') {
        continue
      }
      if (excludeSessionId && session.sessionId === excludeSessionId) {
        continue
      }
      const sessionHost = typeof session.host === 'string' ? session.host : undefined
      const sessionDirection = session.direction === 'inbound' ? 'inbound' : 'outbound'
      if (sessionHost === host && sessionDirection === direction) {
        matched.push(session.sessionId)
      }
    }
    return matched
  }
}
