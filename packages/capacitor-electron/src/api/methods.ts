import { BRIDGE_METHODS } from '../shared/protocol/constants'

export const API_METHODS = {
  getRuntimeInfo: BRIDGE_METHODS.runtimeGetInfo,
  resolveRuntimeActions: BRIDGE_METHODS.runtimeResolveActions,
  executeRuntimeAction: BRIDGE_METHODS.runtimeExecute,
  getPluginCatalog: BRIDGE_METHODS.pluginCatalogGet,
  openExternal: BRIDGE_METHODS.externalOpen,
  readFile: BRIDGE_METHODS.fileRead,
  startDeviceDiscovery: BRIDGE_METHODS.discoveryStart,
  stopDeviceDiscovery: BRIDGE_METHODS.discoveryStop,
  listDiscoveredDevices: BRIDGE_METHODS.discoveryList,
  openConnectionSession: BRIDGE_METHODS.connectionOpenSession,
  closeConnectionSession: BRIDGE_METHODS.connectionCloseSession,
  sendConnectionSessionMessage: BRIDGE_METHODS.connectionSendMessage,
  getConnectionSessionState: BRIDGE_METHODS.connectionGetSessionState,
  pullConnectionHostEvents: BRIDGE_METHODS.connectionPullHostEvents
} as const
