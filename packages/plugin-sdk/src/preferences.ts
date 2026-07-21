/**
 * Host-supplied KV preferences adapter that plugin bundles see
 * through `bridge.usePreferences()`. The actual implementation
 * lives on the host side (typically a thin wrapper around
 * `@synra/capacitor-preferences`'s `SynraPreferences` plugin object,
 * proxied through the Electron-side `preferences.*` IPC bridge when
 * the host is Electron); plugin-sdk only owns the type so the v3
 * contract stays types-only for plugin authors.
 *
 * Why this exists as a separate surface (not direct plugin access to
 * `SynraPreferences`):
 *
 *  - Plugins run inside the host's renderer / WebView. Pulling
 *    `@synra/capacitor-preferences` directly into the plugin bundle
 *    forces every plugin to ship the Capacitor plugin glue code and
 *    would crash any non-Capacitor host (plain web, headless test
 *    harness). Routing through `bridge.usePreferences()` keeps the
 *    plugin bundle host-agnostic.
 *  - On Electron, the host stores preferences in a JSON file under
 *    `~/.synra/synra-preferences-store.json`. A plugin that talks
 *    to `SynraPreferences` directly on Electron would land in the
 *    wrong store; going through the bridge guarantees the same KV
 *    surface every other host component uses.
 *  - Per-plugin key namespacing (planned) will live in the host-side
 *    adapter so plugin authors cannot accidentally collide with
 *    host keys like `synra.pairedDevices`.
 *
 * The handle shape mirrors the three operations plugins need
 * (read, write, delete) — kept minimal so future server-side or
 * encrypted variants can be swapped in without touching plugin code.
 */
export type PluginPreferencesHandle = {
  /**
   * Read a value by key. Returns `null` when the key has never
   * been written (the standard convention from
   * `@synra/capacitor-preferences`).
   */
  get(key: string): Promise<string | null>
  /** Write a string value under `key`. Overwrites any prior value. */
  set(key: string, value: string): Promise<void>
  /** Delete the value under `key`. No-op when the key is absent. */
  remove(key: string): Promise<void>
}
