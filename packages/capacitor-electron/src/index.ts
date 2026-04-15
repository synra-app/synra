export {
  createElectronBridgePlugin,
  createElectronBridgePluginFromGlobal,
  type ElectronBridgePlugin,
} from "./api/plugin";
export { API_METHODS } from "./api/methods";
export { createPreloadInvoker, type IpcInvoke, type InvokeOptions } from "./bridge/preload/invoke";
export {
  exposePreloadBridge,
  type PreloadBridgeApi,
  type PreloadBridgeInvoke,
  type PreloadExposeTarget,
} from "./bridge/preload/expose";
export {
  createBridgeHandlers,
  type BridgeHandlerDependencies,
  type BridgeHandlerMap,
} from "./bridge/main/handlers";
export { createMainDispatcher, type MainDispatcherOptions } from "./bridge/main/dispatch";
export {
  registerBridgeHandlers,
  type IpcMainLike,
  type RegisterBridgeHandlersOptions,
} from "./bridge/main/register";
export { setupBridgeMainRuntime, type BridgeRuntimeOptions } from "./bridge/main/runtime";
export {
  createRuntimeInfoService,
  type RuntimeInfoServiceOptions,
} from "./host/services/runtime-info.service";
export {
  createExternalLinkService,
  type ExternalLinkService,
} from "./host/services/external-link.service";
export {
  createFileService,
  type FileService,
  type FileServiceOptions,
} from "./host/services/file.service";
export { createShellAdapter, type ShellAdapter } from "./host/adapters/electron-shell.adapter";
export {
  createFileSystemAdapter,
  type FileSystemAdapter,
} from "./host/adapters/file-system.adapter";
export { BRIDGE_ERROR_CODES, type BridgeErrorCode } from "./shared/errors/codes";
export { BridgeError, toBridgeError, type BridgeErrorDetails } from "./shared/errors/bridge-error";
export {
  BRIDGE_CHANNEL_WHITELIST,
  BRIDGE_INVOKE_CHANNEL,
  BRIDGE_METHODS,
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_SUPPORTED_PROTOCOL_VERSIONS,
  type BridgeMethod,
} from "./shared/protocol/constants";
export type {
  BridgeErrorResponse,
  BridgeRequest,
  BridgeRequestMeta,
  BridgeResponse,
  BridgeSuccessResponse,
  MethodPayloadMap,
  MethodResultMap,
  OpenExternalOptions,
  OperationResult,
  ReadFileOptions,
  ReadFileResult,
  RuntimeInfo,
} from "./shared/protocol/types";
export {
  isBridgeRequest,
  isBridgeResponse,
  isSupportedMethod,
  isSupportedProtocolVersion,
  validateExternalOpenPayload,
  validateReadFilePayload,
} from "./shared/schema/validators";
export {
  noopBridgeLogger,
  type BridgeLogRecord,
  type BridgeLogger,
} from "./shared/observability/logger";
