/** Fired when the native plugin install store changes (e.g. inbound file.transfer bundle persisted). */
export const SYNRA_PLUGIN_INSTALL_STORE_CHANGED_EVENT = 'synra:plugin-install-store-changed'

export function dispatchPluginInstallStoreChanged(): void {
  if (typeof window === 'undefined') {
    return
  }
  window.dispatchEvent(new CustomEvent(SYNRA_PLUGIN_INSTALL_STORE_CHANGED_EVENT))
}
