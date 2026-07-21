/**
 * Re-export shim for the canonical `BridgeError` class & helpers.
 *
 * The actual definitions (`BridgeError`, `BridgeErrorDetails`,
 * `toBridgeError`) live in `@synra/bridge-schema`. We re-export here so
 * internal imports (`from '../shared/errors/bridge-error'`) keep
 * working.
 */
export { BridgeError, toBridgeError, type BridgeErrorDetails } from '@synra/bridge-schema'
