declare global {
  interface Window {
    __synraCapElectron?: {
      invoke: (
        method: "runtime.getInfo" | "external.open" | "file.read",
        payload: Record<string, unknown>,
        options?: { timeoutMs?: number },
      ) => Promise<unknown>;
    };
  }
}

export {};
