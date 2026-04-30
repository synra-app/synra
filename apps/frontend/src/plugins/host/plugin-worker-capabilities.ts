import { Capacitor } from '@capacitor/core'

/**
 * Phase 2: plugin `entries.worker` — prefer explicit HTTP/asset URLs on native; classic Worker on web.
 */
export function synraPluginWorkerEntrySupported(): boolean {
  return typeof Worker !== 'undefined' && Capacitor.getPlatform() === 'web'
}
