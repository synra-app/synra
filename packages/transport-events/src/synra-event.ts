import { getSynraRuntimePlatform, type SynraRuntimePlatform } from './runtime-platform.js'

/** Normalized context for a received LAN `event` frame (app layer; not the raw plugin envelope). */
export type SynraWireEventContext = {
  event: string
  requestId: string
  from: string
  target: string
  replyRequestId?: string
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
  event: string
  handlers: SynraEventHandlers
}

const registry = new Map<string, Registration>()

export type CreateSynraEventOptions = {
  event: string
  handlers?: SynraEventHandlers
  /** When true (default), register for {@link dispatchSynraWireEvent}. */
  register?: boolean
}

export type SynraEvent = {
  readonly event: string
  readonly handlers: SynraEventHandlers
  unregister(): void
}

/**
 * Registers a LAN `event` → per-platform handlers (or `unsupported`).
 * Platform keys align with handle naming: `windows` → implement `handleWindows`, etc.
 */
export function createSynraEvent(options: CreateSynraEventOptions): SynraEvent {
  const handlers = options.handlers ?? {}
  const reg: Registration = { event: options.event, handlers }
  if (options.register !== false) {
    registry.set(options.event, reg)
  }
  return {
    event: options.event,
    handlers,
    unregister() {
      const current = registry.get(options.event)
      if (current === reg) {
        registry.delete(options.event)
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

export function unregisterSynraEventByName(event: string): void {
  registry.delete(event)
}

export function clearSynraWireEventRegistryForTests(): void {
  registry.clear()
}

/**
 * Dispatches a received wire event to the handler for {@link getSynraRuntimePlatform}.
 * No-op if `event` was never registered.
 */
export async function dispatchSynraWireEvent(ctx: SynraWireEventContext): Promise<void> {
  const reg = registry.get(ctx.event)
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
