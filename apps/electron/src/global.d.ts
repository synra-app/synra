import type { InvokeOptions, MethodPayloadMap, MethodResultMap } from "@synra/capacitor-electron";

type ElectronBridgeGlobal = {
  __synraCapElectron?: {
    invoke: <TMethod extends keyof MethodPayloadMap>(
      method: TMethod,
      payload: MethodPayloadMap[TMethod],
      options?: InvokeOptions,
    ) => Promise<MethodResultMap[TMethod]>;
  };
};

declare global {
  interface Window extends ElectronBridgeGlobal {}
}

export {};
