import { registerPlugin } from '@capacitor/core'
import type { SynraClipboardPlugin } from './definitions'

/**
 * SynraClipboard — cross-platform clipboard (read/write) with first-class
 * support for the Capacitor Android WebView, where `navigator.clipboard.writeText`
 * is gated by user-activation and frequently throws `NotAllowedError` from
 * plugin code that has no click handler in scope. The native plugin uses
 * `ClipboardManager.setPrimaryClip` on Android and `UIPasteboard.general`
 * on iOS, both of which bypass the WebView clipboard policy.
 *
 * On Electron, the renderer-side JS shim hops to the main process via
 * the existing `@synra/capacitor-electron` invoke bridge, which uses
 * Electron's `clipboard` module (synchronous on the main side).
 *
 * On plain web, falls back to `navigator.clipboard`; on browsers without
 * the Async Clipboard API, `write()` rejects with an explicit error
 * (`unavailable`) so callers can surface it cleanly.
 */
const SynraClipboard = registerPlugin<SynraClipboardPlugin>('SynraClipboard', {
  web: async () => {
    const [webModule, electronModule] = await Promise.all([import('./web'), import('./electron')])
    const target = globalThis as {
      __synraCapElectron?: { invoke?: (...args: unknown[]) => Promise<unknown> }
    }
    if (typeof target.__synraCapElectron?.invoke === 'function') {
      return new electronModule.SynraClipboardElectron()
    }
    return new webModule.SynraClipboardWeb()
  },
  electron: () => import('./electron').then((m) => new m.SynraClipboardElectron())
})

export * from './definitions'
export { SynraClipboard }
