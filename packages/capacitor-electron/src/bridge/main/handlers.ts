import { BRIDGE_METHODS } from "../../shared/protocol/constants";
import type { BridgeRequest, MethodPayloadMap, MethodResultMap } from "../../shared/protocol/types";
import type { ExternalLinkService } from "../../host/services/external-link.service";
import type { FileService } from "../../host/services/file.service";

type RuntimeInfoService = ReturnType<
  typeof import("../../host/services/runtime-info.service").createRuntimeInfoService
>;

export type BridgeHandlerDependencies = {
  runtimeInfoService: RuntimeInfoService;
  externalLinkService: ExternalLinkService;
  fileService: FileService;
};

export type BridgeHandlerMap = {
  [K in keyof MethodPayloadMap]: (
    request: BridgeRequest<MethodPayloadMap[K]>,
  ) => Promise<MethodResultMap[K]>;
};

export function createBridgeHandlers(deps: BridgeHandlerDependencies): BridgeHandlerMap {
  return {
    [BRIDGE_METHODS.runtimeGetInfo]: async () => deps.runtimeInfoService.getRuntimeInfo(),
    [BRIDGE_METHODS.externalOpen]: async (request) =>
      deps.externalLinkService.openExternal(request.payload.url),
    [BRIDGE_METHODS.fileRead]: async (request) =>
      deps.fileService.readFile(request.payload.path, request.payload.encoding),
  };
}
