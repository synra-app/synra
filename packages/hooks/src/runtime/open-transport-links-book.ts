import { type Ref } from 'vue'
import type { AppLinkState, RuntimeOpenTransportLink } from '../types'
import {
  MAX_CLOSED_OPEN_TRANSPORT_LINKS,
  OPEN_TRANSPORT_LINKS_REBUILD_DEBOUNCE_MS
} from './constants'

export class OpenTransportLinksBook {
  private readonly linkByDeviceId = new Map<string, RuntimeOpenTransportLink>()
  private openLinksRebuildTimer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly openTransportLinks: Ref<RuntimeOpenTransportLink[]>) {}

  private linkSortValue(link: RuntimeOpenTransportLink): number {
    return Number(link.lastActiveAt ?? link.closedAt ?? link.openedAt ?? 0)
  }

  private pruneDeadLinks(entries: RuntimeOpenTransportLink[]): RuntimeOpenTransportLink[] {
    if (entries.length <= MAX_CLOSED_OPEN_TRANSPORT_LINKS) {
      return entries
    }
    return entries.slice(0, MAX_CLOSED_OPEN_TRANSPORT_LINKS)
  }

  rebuildOpenLinksView(): void {
    const readyLinks: RuntimeOpenTransportLink[] = []
    const deadLinks: RuntimeOpenTransportLink[] = []

    for (const item of this.linkByDeviceId.values()) {
      if (
        item.transport === 'ready' ||
        item.transport === 'handshaking' ||
        item.transport === 'idle'
      ) {
        readyLinks.push(item)
      } else {
        deadLinks.push(item)
      }
    }

    readyLinks.sort((left, right) => this.linkSortValue(right) - this.linkSortValue(left))
    deadLinks.sort((left, right) => this.linkSortValue(right) - this.linkSortValue(left))
    const retainedDeadLinks = this.pruneDeadLinks(deadLinks)
    const nextView = [...readyLinks, ...retainedDeadLinks]

    this.openTransportLinks.value = nextView

    const retainedIds = new Set(nextView.map((item) => item.deviceId))
    for (const deviceId of this.linkByDeviceId.keys()) {
      if (!retainedIds.has(deviceId)) {
        this.linkByDeviceId.delete(deviceId)
      }
    }
  }

  scheduleOpenLinksRebuild(immediate = false): void {
    if (immediate) {
      if (this.openLinksRebuildTimer) {
        clearTimeout(this.openLinksRebuildTimer)
        this.openLinksRebuildTimer = undefined
      }
      this.rebuildOpenLinksView()
      return
    }

    if (this.openLinksRebuildTimer) {
      return
    }

    this.openLinksRebuildTimer = setTimeout(() => {
      this.openLinksRebuildTimer = undefined
      this.rebuildOpenLinksView()
    }, OPEN_TRANSPORT_LINKS_REBUILD_DEBOUNCE_MS)
  }

  upsertOpenLink(next: RuntimeOpenTransportLink, options: { immediate?: boolean } = {}): void {
    const current = this.linkByDeviceId.get(next.deviceId)
    const merged = current
      ? {
          ...current,
          ...next
        }
      : next
    this.linkByDeviceId.set(next.deviceId, merged)

    this.scheduleOpenLinksRebuild(Boolean(options.immediate))
  }

  /**
   * Marks transport dead (TCP gone). Returns a snapshot of the row before mutation when
   * transport was still usable, so callers can clear pairing UI keyed by `deviceId`.
   */
  markTransportDead(
    deviceId: string | undefined,
    reasonAt: number
  ): RuntimeOpenTransportLink | undefined {
    if (!deviceId) {
      return undefined
    }
    const current = this.linkByDeviceId.get(deviceId)
    if (!current) {
      return undefined
    }
    if (current.transport === 'dead') {
      this.upsertOpenLink(
        {
          ...current,
          closedAt: reasonAt,
          lastActiveAt: reasonAt
        },
        { immediate: true }
      )
      return undefined
    }
    const snapshot: RuntimeOpenTransportLink = { ...current }
    this.upsertOpenLink(
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

  setLinkAppState(
    deviceId: string,
    app: AppLinkState,
    options: { lastAppError?: string; immediate?: boolean } = {}
  ): void {
    const current = this.linkByDeviceId.get(deviceId)
    if (!current || current.transport === 'dead') {
      return
    }
    this.upsertOpenLink(
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
    for (const link of this.linkByDeviceId.values()) {
      if (link.transport === 'dead') {
        continue
      }
      if (link.deviceId === trimmed) {
        this.setLinkAppState(link.deviceId, app, { ...options, immediate: true })
      }
    }
  }

  touchLinkActivity(
    deviceId: string,
    updatedAt: number,
    fallbackDirection: 'inbound' | 'outbound'
  ): void {
    const existing = this.linkByDeviceId.get(deviceId)
    if (!existing || existing.transport !== 'ready') {
      return
    }
    this.upsertOpenLink({
      ...existing,
      lastActiveAt: updatedAt,
      direction: existing.direction ?? fallbackDirection
    })
  }
}
