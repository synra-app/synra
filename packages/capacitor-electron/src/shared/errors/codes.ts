/**
 * Re-export shim for the canonical bridge error code table.
 *
 * The actual definitions (`BRIDGE_ERROR_CODES`, `BridgeErrorCode`) live
 * in `@synra/bridge-schema`. We re-export here so internal imports
 * (`from '../shared/errors/codes'`) keep working.
 */
export { BRIDGE_ERROR_CODES, type BridgeErrorCode } from '@synra/bridge-schema'
