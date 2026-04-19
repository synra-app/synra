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
  probeDiscoveredDevicesConnectable: BRIDGE_METHODS.discoveryProbeConnectable,
  openDiscoverySession: BRIDGE_METHODS.discoveryOpenSession,
  closeDiscoverySession: BRIDGE_METHODS.discoveryCloseSession,
  sendDiscoverySessionMessage: BRIDGE_METHODS.discoverySendMessage,
  getDiscoverySessionState: BRIDGE_METHODS.discoveryGetSessionState,
  pullDiscoveryHostEvents: BRIDGE_METHODS.discoveryPullHostEvents,
  openConnectionSession: BRIDGE_METHODS.connectionOpenSession,
  closeConnectionSession: BRIDGE_METHODS.connectionCloseSession,
  sendConnectionSessionMessage: BRIDGE_METHODS.connectionSendMessage,
  getConnectionSessionState: BRIDGE_METHODS.connectionGetSessionState,
  pullConnectionHostEvents: BRIDGE_METHODS.connectionPullHostEvents
} as const
