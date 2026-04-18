export type ChatSession = {
  sessionId: string;
  deviceId?: string;
  remote?: string;
  direction: "incoming" | "outgoing";
  status: "open" | "closed";
  lastActiveAt: string;
};

export type SessionLogEntry = {
  id: string;
  timestamp: number;
  type: "sessionOpened" | "messageSent" | "messageAck" | "transportError";
  payload: unknown;
};
