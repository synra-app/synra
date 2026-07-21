/**
 * Browser-safe entry: IPC protocol constants and types only (no Node/Electron host code).
 *
 * Wire-schema constants (`BRIDGE_METHODS`, `BRIDGE_PROTOCOL_VERSION`, …)
 * are sourced from `@synra/bridge-schema` so downstream browser
 * consumers (renderer plugins, schema-only dependents) don't need to
 * pull the Electron runtime stack into their type graph.
 */
export {
  BRIDGE_CHANNEL_WHITELIST,
  BRIDGE_HOST_EVENT_CHANNEL,
  BRIDGE_INVOKE_CHANNEL,
  BRIDGE_PLUGIN_SYNC_TO_DEVICE_TIMEOUT_MS
} from './shared/protocol/constants'

export {
  BRIDGE_METHODS,
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_SUPPORTED_PROTOCOL_VERSIONS,
  type BridgeMethod
} from '@synra/bridge-schema'

export type * from '@synra/bridge-schema'
