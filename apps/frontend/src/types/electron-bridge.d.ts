declare global {
  type SynraHostEvent = {
    id: number;
    timestamp: number;
    type: "clientConnected" | "clientClosed" | "messageReceived";
    remote: string;
    sessionId?: string;
    messageId?: string;
    payload?: unknown;
  };

  interface Window {
    __synraCapElectron?: {
      invoke: (
        method: string,
        payload: Record<string, unknown>,
        options?: { timeoutMs?: number },
      ) => Promise<unknown>;
      onHostEvent?: (listener: (event: SynraHostEvent) => void) => () => void;
    };
  }
}

export {};
