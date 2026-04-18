export type SessionLogEntry = {
  id: string;
  type:
    | "sessionOpened"
    | "sessionClosed"
    | "messageSent"
    | "messageReceived"
    | "messageAck"
    | "hostEvent"
    | "transportError";
  payload: unknown;
  timestamp: number;
};
