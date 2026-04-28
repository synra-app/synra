import { isElectronMainProcess } from '../runtime/is-electron-main-process'

/**
 * Where `useSynraEvent` is running. Uses the same Electron-main probe as
 * {@link resolveRuntimeAdapter} (`isElectronMainProcess`); non-main surfaces map to the Capacitor adapter path.
 * SYNRA-COMM::MESSAGE_ENVELOPE::CONNECT::SYNRA_EVENT_RUNTIME_SURFACE
 */
export type SynraEventRuntimeSurface =
  | 'electron-main'
  | 'electron-renderer'
  | 'capacitor-native'
  | 'web'

export function getSynraEventRuntimeSurface(): SynraEventRuntimeSurface {
  const g = globalThis as {
    process?: { versions?: { electron?: string }; type?: string }
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string }
  }
  const pe = g.process?.versions?.electron
  if (pe) {
    if (isElectronMainProcess()) {
      return 'electron-main'
    }
    if (g.process?.type === 'renderer') {
      return 'electron-renderer'
    }
  }
  if (g.Capacitor?.isNativePlatform?.() === true) {
    return 'capacitor-native'
  }
  if (g.Capacitor?.getPlatform?.() === 'electron') {
    return 'electron-renderer'
  }
  if (g.Capacitor) {
    return 'capacitor-native'
  }
  return 'web'
}
