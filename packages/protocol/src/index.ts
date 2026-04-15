export const PROTOCOL_VERSION = "1.0" as const;

export type DeviceId = string;
export type SessionId = string;
export type TraceId = string;
export type MessageId = string;
export type ActionId = string;

export type SynraMessageType =
  | "share.detected"
  | "action.proposed"
  | "action.selected"
  | "action.executing"
  | "action.completed"
  | "action.failed";

export type SynraCrossDeviceMessage<TPayload = unknown> = {
  protocolVersion: typeof PROTOCOL_VERSION;
  messageId: MessageId;
  sessionId: SessionId;
  traceId: TraceId;
  type: SynraMessageType;
  sentAt: number;
  ttlMs: number;
  fromDeviceId: DeviceId;
  toDeviceId: DeviceId;
  payload: TPayload;
};

export type SynraActionRequest<TPayload = unknown> = {
  actionId: ActionId;
  pluginId: string;
  actionType: string;
  payload: TPayload;
};

export type SynraErrorCode =
  | "INVALID_PARAMS"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "TIMEOUT"
  | "UNSUPPORTED_OPERATION"
  | "INTERNAL_ERROR";

export type SynraActionReceipt =
  | {
      ok: true;
      actionId: ActionId;
      handledBy: string;
      durationMs: number;
      output?: unknown;
    }
  | {
      ok: false;
      actionId: ActionId;
      handledBy: string;
      durationMs: number;
      retryable: boolean;
      error: {
        code: SynraErrorCode;
        message: string;
        details?: unknown;
      };
    };

export function createMessage<TPayload>(
  input: Omit<SynraCrossDeviceMessage<TPayload>, "protocolVersion">,
): SynraCrossDeviceMessage<TPayload> {
  return {
    ...input,
    protocolVersion: PROTOCOL_VERSION,
  };
}
