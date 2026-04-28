import type { SynraMessageEnvelope } from '@synra/envelope'

type MainDispatch = (envelope: SynraMessageEnvelope) => void

let mainDispatch: MainDispatch | undefined

/**
 * Set by the Electron `browser` process so `useSynraEvent().send` for host-only events
 * can `webContents.send` to all windows. Optional for non-Electron.
 */
export function setSynraHostEnvelopeMainDispatch(dispatch: MainDispatch | undefined): void {
  mainDispatch = dispatch
}

export function dispatchHostEnvelopeFromMainIfRegistered(envelope: SynraMessageEnvelope): void {
  mainDispatch?.(envelope)
}
