type ElectronBridgeGlobal = {
  __synraCapElectron?: {
    invoke: (
      method: "runtime.getInfo" | "external.open" | "file.read",
      payload: Record<string, unknown>,
      options?: { timeoutMs?: number },
    ) => Promise<unknown>;
  };
};

declare module "@synra/capacitor-electron" {
  export type BridgeRuntimeOptions = {
    allowedFileRoots?: string[];
    capacitorVersion?: string;
    electronVersion?: string;
    shellAdapter?: {
      openExternal(url: string): Promise<void>;
    };
  };

  export type IpcInvoke = (
    channel: string,
    request: {
      protocolVersion: string;
      requestId: string;
      method: string;
      payload: unknown;
      meta?: { timeoutMs?: number; source?: string };
    },
  ) => Promise<unknown>;

  export function setupBridgeMainRuntime(
    ipcMainLike: {
      handle(
        channel: string,
        listener: (_event: unknown, request: unknown) => Promise<unknown>,
      ): void;
    },
    options?: BridgeRuntimeOptions,
  ): void;

  export function createPreloadInvoker(
    ipcInvoke: IpcInvoke,
  ): <TMethod extends "runtime.getInfo" | "external.open" | "file.read">(
    method: TMethod,
    payload: Record<string, unknown>,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ) => Promise<unknown>;
}

declare global {
  interface Window extends ElectronBridgeGlobal {}
}

export {};
