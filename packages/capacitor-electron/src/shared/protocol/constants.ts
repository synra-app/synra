/**
 * Bridge constants — runtime-internal channel names and timeouts only.
 *
 * Wire-protocol constants (`BRIDGE_METHODS`, `BRIDGE_PROTOCOL_VERSION`,
 * `BRIDGE_SUPPORTED_PROTOCOL_VERSIONS`, `BridgeMethod`) live in
 * `@synra/bridge-schema` so downstream packages can consume the schema
 * without pulling in this runtime stack. They are re-exported from
 * `../index` to preserve the existing public API.
 */
export const BRIDGE_INVOKE_CHANNEL = 'synra:cap-electron:v1:invoke' as const
export const BRIDGE_HOST_EVENT_CHANNEL = 'synra:cap-electron:v1:host-event' as const

export const BRIDGE_CHANNEL_WHITELIST = [BRIDGE_INVOKE_CHANNEL, BRIDGE_HOST_EVENT_CHANNEL] as const

/** IPC dispatch ceiling for `plugin.syncToDevice` (many sequential TCP chunks). */
export const BRIDGE_PLUGIN_SYNC_TO_DEVICE_TIMEOUT_MS = 30 * 60 * 1000
