export const BRIDGE_PROTOCOL_VERSION = '1.0' as const

export const BRIDGE_SUPPORTED_PROTOCOL_VERSIONS = [BRIDGE_PROTOCOL_VERSION] as const

export const BRIDGE_INVOKE_CHANNEL = 'synra:cap-electron:v1:invoke' as const
export const BRIDGE_HOST_EVENT_CHANNEL = 'synra:cap-electron:v1:host-event' as const

export const BRIDGE_CHANNEL_WHITELIST = [BRIDGE_INVOKE_CHANNEL, BRIDGE_HOST_EVENT_CHANNEL] as const

export const BRIDGE_METHODS = {
  runtimeGetInfo: 'runtime.getInfo',
  runtimeResolveActions: 'runtime.resolveActions',
  runtimeExecute: 'runtime.execute',
  pluginCatalogGet: 'plugin.catalog.get',
  pluginInstall: 'plugin.install',
  pluginInstallLocal: 'plugin.installLocal',
  pluginUninstall: 'plugin.uninstall',
  pluginListInstalled: 'plugin.listInstalled',
  pluginRegisterInstalled: 'plugin.registerInstalled',
  pluginSyncToDevice: 'plugin.syncToDevice',
  externalOpen: 'external.open',
  clipboardRead: 'clipboard.read',
  clipboardReadSelection: 'clipboard.readSelection',
  clipboardWrite: 'clipboard.write',
  fileRead: 'file.read',
  discoveryStart: 'discovery.start',
  discoveryStop: 'discovery.stop',
  discoveryList: 'discovery.list',
  connectionOpenTransport: 'connection.openTransport',
  connectionCloseTransport: 'connection.closeTransport',
  connectionSendMessage: 'connection.sendMessage',
  connectionSendLanEvent: 'connection.sendLanEvent',
  connectionGetTransportState: 'connection.getTransportState',
  preferencesGet: 'preferences.get',
  preferencesSet: 'preferences.set',
  preferencesRemove: 'preferences.remove'
} as const

export type BridgeMethod = (typeof BRIDGE_METHODS)[keyof typeof BRIDGE_METHODS]

/** IPC dispatch ceiling for `plugin.syncToDevice` (many sequential TCP chunks). */
export const BRIDGE_PLUGIN_SYNC_TO_DEVICE_TIMEOUT_MS = 30 * 60 * 1000
