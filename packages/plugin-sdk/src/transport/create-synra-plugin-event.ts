/**
 * TODO: Prefix `event` with `pluginId` (e.g. `chat.send`), wire per-platform ctx handlers
 * aligned with `SynraRuntimePlatform`, and integrate with the shared `SynraEvent` dispatch
 * registry from `@synra/transport-events`. Not implemented in this iteration.
 */
export type SynraPluginEventSpec = {
  /** Logical event name within the plugin (before namespacing). */
  event: string
  /** Per-platform or shared handler wiring; shape TBD. */
  handlers?: unknown
}

export type SynraPluginEvent = {
  readonly pluginId: string
  readonly event: string
  unregister(): void
}

/**
 * Placeholder factory for plugin-scoped LAN wire events. See module TODO.
 */
export function createSynraPluginEvent(
  pluginId: string,
  _spec: SynraPluginEventSpec
): SynraPluginEvent {
  return {
    pluginId,
    event: _spec.event,
    unregister: () => {
      /* no-op until registry integration */
    }
  }
}
