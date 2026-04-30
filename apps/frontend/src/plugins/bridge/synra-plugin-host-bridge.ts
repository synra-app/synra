import { Capacitor } from '@capacitor/core'
import {
  createElectronBridgePluginFromGlobal,
  type ElectronBridgePlugin
} from '@synra/capacitor-electron/plugin'
import { createCapacitorSynraPluginBridge } from './capacitor-plugin-host'

/**
 * Unified runtime bridge for plugin catalog/install/sync/readFile used by the SPA.
 * Electron preload → IPC; Capacitor native → Filesystem + DeviceConnection.
 */
export function tryGetSynraPluginRuntimeBridge(): ElectronBridgePlugin | null {
  if (typeof window !== 'undefined' && window.__synraCapElectron?.invoke) {
    return createElectronBridgePluginFromGlobal()
  }
  if (Capacitor.isNativePlatform()) {
    return createCapacitorSynraPluginBridge()
  }
  return null
}

export function getSynraPluginRuntimeBridgeOrThrow(): ElectronBridgePlugin {
  const bridge = tryGetSynraPluginRuntimeBridge()
  if (!bridge) {
    throw new Error(
      'Synra plugin host is unavailable (requires Electron preload or Capacitor native runtime).'
    )
  }
  return bridge
}
