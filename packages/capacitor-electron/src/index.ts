export {
  createElectronBridgePlugin,
  createElectronBridgePluginFromGlobal,
  type ElectronBridgePlugin
} from './api/plugin'
export { API_METHODS } from './api/methods'
export { createPreloadInvoker, type IpcInvoke, type InvokeOptions } from './bridge/preload/invoke'
export {
  exposePreloadBridge,
  type PreloadBridgeApi,
  type PreloadBridgeInvoke,
  type PreloadExposeTarget
} from './bridge/preload/expose'
export {
  createBridgeHandlers,
  type BridgeHandlerDependencies,
  type BridgeHandlerMap
} from './bridge/main/handlers'
export { createMainDispatcher, type MainDispatcherOptions } from './bridge/main/dispatch'
export {
  registerBridgeHandlers,
  type IpcMainLike,
  type RegisterBridgeHandlersOptions
} from './bridge/main/register'
export { setupBridgeMainRuntime, type BridgeRuntimeOptions } from './bridge/main/runtime'
export {
  createRuntimeInfoService,
  type RuntimeInfoServiceOptions
} from './host/services/runtime-info.service'
export {
  createExternalLinkService,
  type ExternalLinkService
} from './host/services/external-link.service'
export {
  createPluginRuntimeService,
  type ExecuteSelectedOptions,
  type PluginRuntimeService,
  type RuntimeMessageEmitter
} from './host/services/plugin-runtime.service'
export {
  createPluginCatalogService,
  type PluginCatalogService
} from './host/services/plugin-catalog.service'
export { createGitHubOpenPlugin } from './host/plugins/github-open.plugin'
export {
  createFileService,
  type FileService,
  type FileServiceOptions
} from './host/services/file.service'
export {
  createDeviceDiscoveryService,
  type DeviceDiscoveryService
} from './host/services/device-discovery.service'
export { createConnectionService, type ConnectionService } from './host/services/connection.service'
export { createShellAdapter, type ShellAdapter } from './host/adapters/electron-shell.adapter'
export {
  createFileSystemAdapter,
  type FileSystemAdapter
} from './host/adapters/file-system.adapter'
export { BRIDGE_ERROR_CODES, type BridgeErrorCode } from './shared/errors/codes'
export { BridgeError, toBridgeError, type BridgeErrorDetails } from './shared/errors/bridge-error'
export {
  BRIDGE_CHANNEL_WHITELIST,
  BRIDGE_HOST_EVENT_CHANNEL,
  BRIDGE_INVOKE_CHANNEL,
  BRIDGE_METHODS,
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_SUPPORTED_PROTOCOL_VERSIONS,
  type BridgeMethod
} from './shared/protocol/constants'
export type {
  BridgeErrorResponse,
  BridgeRequest,
  BridgeRequestMeta,
  BridgeResponse,
  BridgeSuccessResponse,
  MethodPayloadMap,
  MethodResultMap,
  OpenExternalOptions,
  DiscoveryMode,
  DiscoverySource,
  DiscoveryState,
  DiscoveredDevice,
  DeviceDiscoveryListResult,
  DeviceTransportOpenOptions,
  DeviceTransportOpenResult,
  SynraLanConnectType,
  ConnectionTransport,
  DeviceTransportCloseOptions,
  DeviceTransportCloseResult,
  DeviceTransportSendMessageOptions,
  DeviceTransportSendMessageResult,
  DeviceTransportSendLanEventOptions,
  DeviceTransportSendLanEventResult,
  DeviceTransportGetStateOptions,
  DeviceTransportSnapshot,
  DeviceDiscoveryStartOptions,
  DeviceDiscoveryStartResult,
  DeviceDiscoveryHostEvent,
  DeviceDiscoveryPullHostEventsResult,
  PluginCatalogResult,
  OperationResult,
  ReadFileOptions,
  ReadFileResult,
  ResolveRuntimeActionsOptions,
  ResolveRuntimeActionsResult,
  RuntimeActionCandidate,
  RuntimeExecuteOptions,
  RuntimeExecuteResult,
  RuntimeInfo
} from './shared/protocol/types'
export {
  isBridgeRequest,
  isBridgeResponse,
  isSupportedMethod,
  isSupportedProtocolVersion,
  validateResolveActionsPayload,
  validateRuntimeExecutePayload,
  validateExternalOpenPayload,
  validateReadFilePayload,
  validateDiscoveryStartPayload,
  validateDiscoveryOpenTransportPayload,
  validateDiscoverySendMessagePayload,
  validateDiscoverySendLanEventPayload
} from './shared/schema/validators'
export {
  noopBridgeLogger,
  type BridgeLogRecord,
  type BridgeLogger
} from './shared/observability/logger'
export {
  hasElectronBridge,
  installElectronCapacitor,
  type CapacitorContract,
  type CapacitorWindow
} from './capacitor'
