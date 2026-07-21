import { BRIDGE_METHODS } from '@synra/bridge-schema'

export const API_METHODS = {
  getRuntimeInfo: BRIDGE_METHODS.runtimeGetInfo,
  resolveRuntimeActions: BRIDGE_METHODS.runtimeResolveActions,
  executeRuntimeAction: BRIDGE_METHODS.runtimeExecute,
  getPluginCatalog: BRIDGE_METHODS.pluginCatalogGet,
  installPlugin: BRIDGE_METHODS.pluginInstall,
  installPluginFromLocalPath: BRIDGE_METHODS.pluginInstallLocal,
  uninstallPlugin: BRIDGE_METHODS.pluginUninstall,
  listInstalledPlugins: BRIDGE_METHODS.pluginListInstalled,
  registerInstalledPlugins: BRIDGE_METHODS.pluginRegisterInstalled,
  syncPluginToDevice: BRIDGE_METHODS.pluginSyncToDevice,
  openExternal: BRIDGE_METHODS.externalOpen,
  readFile: BRIDGE_METHODS.fileRead,
  startDeviceDiscovery: BRIDGE_METHODS.discoveryStart,
  stopDeviceDiscovery: BRIDGE_METHODS.discoveryStop,
  listDiscoveredDevices: BRIDGE_METHODS.discoveryList,
  openConnectionTransport: BRIDGE_METHODS.connectionOpenTransport,
  closeConnectionTransport: BRIDGE_METHODS.connectionCloseTransport,
  sendConnectionTransportMessage: BRIDGE_METHODS.connectionSendMessage,
  getConnectionTransportState: BRIDGE_METHODS.connectionGetTransportState
} as const
