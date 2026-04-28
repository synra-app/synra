/**
 * Main-process and preload entry (no Vue). Re-exported as `@synra/hooks/electron`.
 */
export {
  parseSynraMessageEnvelope,
  isWhitelistedEnvelopeRecord,
  type SynraMessageEnvelope
} from '@synra/envelope'
export { setSynraHostEnvelopeMainDispatch } from './synra/host-envelope-main-dispatch'
export {
  SYNRA_HOST_ENVELOPE_PUSH_CHANNEL,
  SYNRA_HOST_ENVELOPE_INVOKE_CHANNEL
} from './synra/host-ipc-constants'
