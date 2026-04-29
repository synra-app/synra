import { isElectronMainProcess } from './electron-main-process'

/**
 * Where `useSynraEnvelope` / `useSynraSystemEnvelope` is running. Uses the same Electron-main probe as
 * runtime adapter selection (`isElectronMainProcess`); non-main surfaces map to the Capacitor adapter path.
 * SYNRA-COMM::MESSAGE_ENVELOPE::CONNECT::SYNRA_ENVELOPE_RUNTIME_SURFACE
 */
export type SynraEnvelopeRuntimeSurface =
  | 'electron-main'
  | 'electron-renderer'
  | 'capacitor-native'
  | 'web'

export function getSynraEnvelopeRuntimeSurface(): SynraEnvelopeRuntimeSurface {
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
