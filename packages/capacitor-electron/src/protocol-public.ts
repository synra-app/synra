/**
 * Browser-safe entry: IPC protocol constants and types only (no Node/Electron host code).
 */
export {
  BRIDGE_CHANNEL_WHITELIST,
  BRIDGE_HOST_EVENT_CHANNEL,
  BRIDGE_INVOKE_CHANNEL,
  BRIDGE_METHODS,
  BRIDGE_PLUGIN_SYNC_TO_DEVICE_TIMEOUT_MS,
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_SUPPORTED_PROTOCOL_VERSIONS
} from './shared/protocol/constants'

export type { BridgeMethod } from './shared/protocol/constants'

export type * from './shared/protocol/types'
