import { Capacitor } from '@capacitor/core'

/** Resolved once at startup; desktop uses OS names, not `electron-*` prefixes. */
export type SynraRuntimePlatform = 'ios' | 'android' | 'web' | 'windows' | 'macos' | 'linux'

const VALID_PLATFORMS: readonly SynraRuntimePlatform[] = [
  'ios',
  'android',
  'web',
  'windows',
  'macos',
  'linux'
] as const

let cached: SynraRuntimePlatform | undefined

function isSynraRuntimePlatform(value: string): value is SynraRuntimePlatform {
  return (VALID_PLATFORMS as readonly string[]).includes(value)
}

function resolveNodeOsToDesktopPlatform(): SynraRuntimePlatform | undefined {
  if (typeof process === 'undefined' || !process.platform) {
    return undefined
  }
  switch (process.platform) {
    case 'win32':
      return 'windows'
    case 'darwin':
      return 'macos'
    case 'linux':
      return 'linux'
    default:
      return 'linux'
  }
}

function readVitePackTarget(): string | undefined {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    const raw = env?.SYNRA_PACK_TARGET?.trim()
    return raw && raw.length > 0 ? raw : undefined
  } catch {
    return undefined
  }
}

/**
 * Call once at app startup. Prefer an explicit `packTarget` from the bundler when available.
 * After this, use {@link getSynraRuntimePlatform}; do not call `Capacitor.getPlatform()` again for dispatch.
 */
export function initSynraRuntimePlatform(options?: { packTarget?: string }): SynraRuntimePlatform {
  if (cached !== undefined) {
    return cached
  }

  const explicit = options?.packTarget?.trim()
  if (explicit && isSynraRuntimePlatform(explicit)) {
    cached = explicit
    return cached
  }

  const fromVite = readVitePackTarget()
  if (fromVite && isSynraRuntimePlatform(fromVite)) {
    cached = fromVite
    return cached
  }

  const cap = Capacitor.getPlatform()
  if (cap === 'electron') {
    const desktop = resolveNodeOsToDesktopPlatform()
    cached = desktop ?? 'linux'
    return cached
  }

  if (cap === 'ios' || cap === 'android' || cap === 'web') {
    const mobile: SynraRuntimePlatform = cap
    cached = mobile
    return cached
  }

  cached = 'web'
  return cached
}

export function getSynraRuntimePlatform(): SynraRuntimePlatform {
  if (cached === undefined) {
    throw new Error(
      'Synra runtime platform is not initialized; call initSynraRuntimePlatform() once at app startup.'
    )
  }
  return cached
}

export function resetSynraRuntimePlatformForTests(): void {
  cached = undefined
}
