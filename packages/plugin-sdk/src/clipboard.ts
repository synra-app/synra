/**
 * Host-supplied clipboard adapter that plugin bundles see through
 * `bridge.useClipboard()`. The actual implementation lives on the host
 * side (e.g. `@synra/capacitor-clipboard`'s `SynraClipboard` plugin
 * object); plugin-sdk only owns the type so the v3 contract stays
 * types-only for plugin authors.
 *
 * Why this exists as a separate surface (not `bridge.writeText(...)`):
 * `navigator.clipboard.writeText` is permission-gated inside the
 * Capacitor Android WebView and frequently throws `NotAllowedError`
 * for plugin code that has no click handler in scope. Routing through
 * the native `ClipboardManager` on Android / `UIPasteboard` on iOS
 * / `electron.clipboard` on PC sidesteps the WebView policy entirely.
 */
export type PluginClipboardHandle = {
  /** Read the host's OS clipboard. Empty string when nothing is set. */
  readText(): Promise<string>
  /** Write `text` to the host's OS clipboard. */
  writeText(text: string): Promise<void>
}
