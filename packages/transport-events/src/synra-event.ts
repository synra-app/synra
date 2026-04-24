import { getSynraRuntimePlatform, type SynraRuntimePlatform } from './runtime-platform.js'

/** Normalized context for a received LAN `event` frame (app layer; not the raw plugin envelope). */
export type SynraWireEventContext = {
  eventName: string
  requestId: string
  sourceDeviceId: string
  targetDeviceId: string
  replyToRequestId?: string
  /** Inner wire payload (same role as `SynraLanWireEvent.payload` in hooks). */
  payload: unknown
  transport: string
}

export type SynraEventHandlers = Partial<
  Record<SynraRuntimePlatform, (ctx: SynraWireEventContext) => void | Promise<void>>
> & {
  unsupported?: (ctx: SynraWireEventContext) => void | Promise<void>
}

type Registration = {
  eventName: string
  handlers: SynraEventHandlers
}

const registry = new Map<string, Registration>()

export type CreateSynraEventOptions = {
  eventName: string
  handlers?: SynraEventHandlers
  /** When true (default), register for {@link dispatchSynraWireEvent}. */
  register?: boolean
}

export type SynraEvent = {
  readonly eventName: string
  readonly handlers: SynraEventHandlers
  unregister(): void
}

/**
 * Registers a LAN `eventName` → per-platform handlers (or `unsupported`).
 * Platform keys align with handle naming: `windows` → implement `handleWindows`, etc.
 */
export function createSynraEvent(options: CreateSynraEventOptions): SynraEvent {
  const handlers = options.handlers ?? {}
  const reg: Registration = { eventName: options.eventName, handlers }
  if (options.register !== false) {
    registry.set(options.eventName, reg)
  }
  return {
    eventName: options.eventName,
    handlers,
    unregister() {
      const current = registry.get(options.eventName)
      if (current === reg) {
        registry.delete(options.eventName)
      }
    }
  }
}

/** Same handler on every {@link SynraRuntimePlatform} (convenience for shared UI logic). */
export function synraHandlersAllPlatforms(
  fn: (ctx: SynraWireEventContext) => void | Promise<void>
): SynraEventHandlers {
  return {
    ios: fn,
    android: fn,
    web: fn,
    windows: fn,
    macos: fn,
    linux: fn
  }
}

export function unregisterSynraEventByName(eventName: string): void {
  registry.delete(eventName)
}

export function clearSynraWireEventRegistryForTests(): void {
  registry.clear()
}

/**
 * Dispatches a received wire event to the handler for {@link getSynraRuntimePlatform}.
 * No-op if `eventName` was never registered.
 */
export async function dispatchSynraWireEvent(ctx: SynraWireEventContext): Promise<void> {
  const reg = registry.get(ctx.eventName)
  if (!reg) {
    return
  }
  const platform = getSynraRuntimePlatform()
  const handler = reg.handlers[platform] ?? reg.handlers.unsupported
  if (!handler) {
    return
  }
  await handler(ctx)
}
