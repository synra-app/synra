/**
 * Cross-platform host-runtime detection + Electron preload bridge
 * types. These are intentionally tiny so plugin bundles stay slim:
 * plugin authors can import `detectHostRuntime()` to render
 * runtime-specific UI (e.g. the starter plugin collapses its
 * controller tabs on Electron because the paired PC is the executor,
 * not the controller).
 *
 * Canonical sources for the wire types live here so plugin bundles
 * don't have to import `@synra/capacitor-electron` just to type the
 * `__synraCapElectron` global. The host's renderer-side preload
 * (`exposePreloadBridge`) installs the matching runtime object so
 * type assertions line up at the call site.
 */

export type HostRuntime =
  | 'electron'
  | 'capacitor-android'
  | 'capacitor-ios'
  | 'capacitor-web'
  | 'web'

interface CapacitorGlobal {
  isNativePlatform(): boolean
  getPlatform(): string
}

/**
 * Best-effort host-runtime detection. Returns `'web'` when neither
 * Electron nor Capacitor globals are present (e.g. a plugin being
 * smoke-tested in an isolated render tree).
 */
export function detectHostRuntime(): HostRuntime {
  const proc = (globalThis as { process?: { versions?: { electron?: string } } }).process
  if (proc?.versions?.electron) return 'electron'
  const cap = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor
  if (cap && typeof cap.isNativePlatform === 'function') {
    if (cap.isNativePlatform()) {
      return cap.getPlatform() === 'ios' ? 'capacitor-ios' : 'capacitor-android'
    }
    return 'capacitor-web'
  }
  return 'web'
}

/**
 * Payload/result shape for one bridge method. Mirror of
 * `MethodPayloadMap` / `MethodResultMap` in `@synra/capacitor-electron` —
 * re-declared here (rather than imported) so `@synra/plugin-sdk` stays
 * free of an `electron`-types transitive dep. Both copies must agree;
 * the host's `exposePreloadBridge` enforces the runtime contract.
 */
export type PreloadBridgeInvoke = <TMethod extends string>(
  method: TMethod,
  payload: unknown,
  options?: { timeoutMs?: number; signal?: AbortSignal }
) => Promise<unknown>

export type PreloadBridgeApi = {
  invoke: PreloadBridgeInvoke
  onHostEvent?: (listener: (event: unknown) => void) => () => void
}

/**
 * Returns the renderer-side Electron preload bridge invoker if one is
 * exposed, otherwise `null`. Mirrors `hasElectronBridge()` in
 * `@synra/capacitor-electron` so plugins can call into Electron-only
 * capabilities (`external.open`, `clipboard.readSelection`, …) without
 * a runtime dep on `@synra/capacitor-electron`.
 */
export function getElectronBridgeInvoker(): PreloadBridgeInvoke | null {
  if (typeof globalThis === 'undefined') return null
  const candidate = (globalThis as { __synraCapElectron?: PreloadBridgeApi }).__synraCapElectron
  if (!candidate || typeof candidate.invoke !== 'function') return null
  return candidate.invoke
}
