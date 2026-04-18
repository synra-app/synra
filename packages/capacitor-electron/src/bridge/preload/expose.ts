import type { MethodPayloadMap, MethodResultMap } from "../../shared/protocol/types";
import type { DeviceDiscoveryHostEvent } from "../../shared/protocol/types";

export type PreloadBridgeInvoke = <TMethod extends keyof MethodPayloadMap>(
  method: TMethod,
  payload: MethodPayloadMap[TMethod],
  options?: { timeoutMs?: number; signal?: AbortSignal },
) => Promise<MethodResultMap[TMethod]>;

export type PreloadBridgeApi = {
  invoke: PreloadBridgeInvoke;
  onHostEvent?: (listener: (event: DeviceDiscoveryHostEvent) => void) => () => void;
};

export type PreloadExposeTarget = {
  __synraCapElectron?: PreloadBridgeApi;
};

export function exposePreloadBridge(
  invoke: PreloadBridgeInvoke,
  target: PreloadExposeTarget = globalThis as unknown as PreloadExposeTarget,
): void {
  target.__synraCapElectron = { invoke };
}
