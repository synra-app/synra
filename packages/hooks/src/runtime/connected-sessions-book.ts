import { type Ref } from 'vue'
import type { AppLinkState, RuntimeConnectedSession } from '../types'
import { CONNECTED_SESSIONS_REBUILD_DEBOUNCE_MS, MAX_CLOSED_CONNECTED_SESSIONS } from './constants'

export class ConnectedSessionsBook {
  private readonly connectedSessionMap = new Map<string, RuntimeConnectedSession>()
  private connectedSessionsRebuildTimer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly connectedSessions: Ref<RuntimeConnectedSession[]>) {}

  private sessionSortValue(session: RuntimeConnectedSession): number {
    return Number(session.lastActiveAt ?? session.closedAt ?? session.openedAt ?? 0)
  }

  private pruneDeadSessions(entries: RuntimeConnectedSession[]): RuntimeConnectedSession[] {
    if (entries.length <= MAX_CLOSED_CONNECTED_SESSIONS) {
      return entries
    }
    return entries.slice(0, MAX_CLOSED_CONNECTED_SESSIONS)
  }

  rebuildConnectedSessionsView(): void {
    const readySessions: RuntimeConnectedSession[] = []
    const deadSessions: RuntimeConnectedSession[] = []

    for (const item of this.connectedSessionMap.values()) {
      if (
        item.transport === 'ready' ||
        item.transport === 'handshaking' ||
        item.transport === 'idle'
      ) {
        readySessions.push(item)
      } else {
        deadSessions.push(item)
      }
    }

    readySessions.sort((left, right) => this.sessionSortValue(right) - this.sessionSortValue(left))
    deadSessions.sort((left, right) => this.sessionSortValue(right) - this.sessionSortValue(left))
    const retainedDeadSessions = this.pruneDeadSessions(deadSessions)
    const nextView = [...readySessions, ...retainedDeadSessions]

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
    next: RuntimeConnectedSession,
    options: { immediate?: boolean } = {}
  ): void {
    const current = this.connectedSessionMap.get(next.sessionId)
    const merged = current
      ? {
          ...current,
          ...next
        }
      : next
    this.connectedSessionMap.set(next.sessionId, merged)

    this.scheduleConnectedSessionsRebuild(Boolean(options.immediate))
  }

  /**
   * Marks transport dead (TCP/session gone). Returns a snapshot of the row before mutation when
   * transport was still usable, so callers can clear pairing UI keyed by `deviceId`.
   */
  markTransportDead(
    sessionId: string | undefined,
    reasonAt: number
  ): RuntimeConnectedSession | undefined {
    if (!sessionId) {
      return undefined
    }
    const current = this.connectedSessionMap.get(sessionId)
    if (!current) {
      return undefined
    }
    if (current.transport === 'dead') {
      this.upsertConnectedSession(
        {
          ...current,
          closedAt: reasonAt,
          lastActiveAt: reasonAt
        },
        { immediate: true }
      )
      return undefined
    }
    const snapshot: RuntimeConnectedSession = { ...current }
    this.upsertConnectedSession(
      {
        ...current,
        transport: 'dead',
        closedAt: reasonAt,
        lastActiveAt: reasonAt
      },
      { immediate: true }
    )
    return snapshot
  }

  setSessionAppLink(
    sessionId: string,
    app: AppLinkState,
    options: { lastAppError?: string; immediate?: boolean } = {}
  ): void {
    const current = this.connectedSessionMap.get(sessionId)
    if (!current || current.transport === 'dead') {
      return
    }
    this.upsertConnectedSession(
      {
        ...current,
        app,
        ...(options.lastAppError !== undefined ? { lastAppError: options.lastAppError } : {}),
        lastActiveAt: Date.now()
      },
      { immediate: Boolean(options.immediate) }
    )
  }

  setAppLinkForDevice(
    deviceId: string,
    app: AppLinkState,
    options: { lastAppError?: string } = {}
  ): void {
    const trimmed = deviceId.trim()
    if (!trimmed) {
      return
    }
    for (const session of this.connectedSessionMap.values()) {
      if (session.transport === 'dead') {
        continue
      }
      if (session.deviceId === trimmed) {
        this.setSessionAppLink(session.sessionId, app, { ...options, immediate: true })
      }
    }
  }

  touchSessionActivity(
    sessionId: string,
    updatedAt: number,
    fallbackDirection: 'inbound' | 'outbound'
  ): void {
    const existing = this.connectedSessionMap.get(sessionId)
    if (!existing || existing.transport !== 'ready') {
      return
    }
    this.upsertConnectedSession({
      ...existing,
      lastActiveAt: updatedAt,
      direction: existing.direction ?? fallbackDirection
    })
  }
}
