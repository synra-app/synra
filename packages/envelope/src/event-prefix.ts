/**
 * Raw wire names use `useSynraEnvelope`. `useSynraSystemEnvelope` / `useSynraPluginEnvelope` add or strip
 * `event` string prefixes (no separate system/plugin domain type; routing is by prefix on the wire `event` string).
 * SYNRA-COMM::MESSAGE_ENVELOPE::CONNECT::SYNRA_EVENT_PREFIX
 */

/** App-level system events on the wire (useSynraSystemEnvelope → useSynraEnvelope). */
export const SYSTEM_WIRE_EVENT_PREFIX = '_synra.' as const

/** App-level plugin events: `_plugin.{pluginSlug}.{logicalEvent}` (useSynraPluginEnvelope → useSynraEnvelope). */
const PLUGIN_WIRE_RE = /^_plugin\.([^.]+)\.(.+)$/s

/** Host-only (Electron main↔renderer) — not the same as `SYSTEM_WIRE_EVENT_PREFIX`. */
export const SYNRA_HOST_ONLY_EVENT_PREFIX = 'synra.internal.host.' as const

/**
 * e.g. `@synra-plugin/chat` → `chat` for `_plugin.chat.*`
 * SYNRA-COMM::MESSAGE_ENVELOPE::CONNECT::PLUGIN_WIRE_SLUG
 */
export function normalizePluginPackageNameToWireSlug(packageOrSlug: string): string {
  const t = packageOrSlug.trim()
  if (t.startsWith('@synra-plugin/')) {
    return t.slice('@synra-plugin/'.length)
  }
  if (t.startsWith('@') && t.includes('/')) {
    return t.split('/').pop()!
  }
  return t
}

export function toSystemWireEvent(logical: string): string {
  if (logical.startsWith(SYSTEM_WIRE_EVENT_PREFIX)) {
    return logical
  }
  if (logical.startsWith('_plugin.')) {
    return logical
  }
  return `${SYSTEM_WIRE_EVENT_PREFIX}${logical}`
}

/**
 * Inbound: strip `SYSTEM_WIRE_EVENT_PREFIX` for useSynraSystemEnvelope user callbacks when present; otherwise pass through (e.g. legacy LAN names).
 */
export function toLogicalFromSystemWireEvent(wire: string): string {
  if (wire.startsWith(SYSTEM_WIRE_EVENT_PREFIX)) {
    return wire.slice(SYSTEM_WIRE_EVENT_PREFIX.length)
  }
  return wire
}

export function toPluginWireEvent(pluginSlug: string, logical: string): string {
  const slug = normalizePluginPackageNameToWireSlug(pluginSlug)
  if (slug.length === 0) {
    throw new Error('useSynraPluginEnvelope: empty plugin slug.')
  }
  if (logical.startsWith('_plugin.')) {
    return logical
  }
  return `_plugin.${slug}.${logical}`
}

export function toLogicalFromPluginWireEvent(wire: string): { slug: string; event: string } | null {
  const m = PLUGIN_WIRE_RE.exec(wire)
  if (!m) {
    return null
  }
  return { slug: m[1], event: m[2] }
}

/**
 * Strips `useSynraSystemEnvelope` / `useSynraPluginEnvelope` prefixes to recover protocol names for
 * `isLanWireEventName` and native `sendLanEvent` (LAN only accepts `LanWireEventName`).
 */
export function stripForTransportRouting(wire: string): string {
  if (wire.startsWith(SYNRA_HOST_ONLY_EVENT_PREFIX)) {
    return wire
  }
  if (wire.startsWith(SYSTEM_WIRE_EVENT_PREFIX)) {
    return wire.slice(SYSTEM_WIRE_EVENT_PREFIX.length)
  }
  const p = toLogicalFromPluginWireEvent(wire)
  if (p) {
    return p.event
  }
  return wire
}

export function isHostOnlySynraEvent(event: string): boolean {
  return event.startsWith(SYNRA_HOST_ONLY_EVENT_PREFIX)
}
