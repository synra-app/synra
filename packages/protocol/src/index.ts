export const PROTOCOL_VERSION = "1.0" as const;

export type DeviceId = string;
export type SessionId = string;
export type TraceId = string;
export type MessageId = string;
export type ActionId = string;

export type LegacySynraMessageType =
  | "share.detected"
  | "action.proposed"
  | "action.selected"
  | "action.executing"
  | "action.completed"
  | "action.failed";

export type SynraMessageType = LegacySynraMessageType;

export type RuntimeMessageType =
  | "runtime.request"
  | "runtime.received"
  | "runtime.started"
  | "runtime.finished"
  | "runtime.error";

export type PluginSyncMessageType = "plugin.catalog.request" | "plugin.catalog.response";

export type ProtocolMessageType = RuntimeMessageType | PluginSyncMessageType;

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

export type ProtocolEnvelope<TType extends ProtocolMessageType, TPayload> = {
  protocolVersion: typeof PROTOCOL_VERSION;
  messageId: MessageId;
  sessionId: SessionId;
  timestamp: number;
  type: TType;
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
  | "INTERNAL_ERROR"
  | "TRANSPORT_DISCONNECTED"
  | "TRANSPORT_UNREACHABLE"
  | "PAIRING_REQUIRED"
  | "PAIRING_EXPIRED"
  | "RUNTIME_NOT_READY"
  | "RUNTIME_EXECUTION_FAILED"
  | "PLUGIN_NOT_FOUND"
  | "PLUGIN_ACTION_INVALID"
  | "USER_CANCELLED";

export type ProtocolErrorCode = SynraErrorCode;

export type RuntimeFinishedStatus = "success" | "failed" | "cancelled";

export type RuntimeRequestPayload<TInput = unknown> = {
  input: TInput;
  requestedAt: number;
};

export type RuntimeReceivedPayload = {
  acknowledgedAt: number;
};

export type RuntimeStartedPayload = {
  startedAt: number;
};

export type ProtocolErrorPayload = {
  code: ProtocolErrorCode;
  message: string;
  details?: unknown;
};

export type RuntimeFinishedPayload<TResult = unknown> = {
  status: RuntimeFinishedStatus;
  finishedAt: number;
  result?: TResult;
  error?: ProtocolErrorPayload;
};

export type RuntimeErrorPayload = {
  code: ProtocolErrorCode;
  message: string;
  retryable?: boolean;
  details?: unknown;
};

export type PluginCatalogRequestPayload = {
  knownPluginIds?: string[];
};

export type PluginCatalogItem = {
  pluginId: string;
  version: string;
  displayName: string;
};

export type PluginCatalogResponsePayload = {
  plugins: PluginCatalogItem[];
  generatedAt: number;
};

export type ProtocolPayloadByType = {
  "runtime.request": RuntimeRequestPayload;
  "runtime.received": RuntimeReceivedPayload;
  "runtime.started": RuntimeStartedPayload;
  "runtime.finished": RuntimeFinishedPayload;
  "runtime.error": RuntimeErrorPayload;
  "plugin.catalog.request": PluginCatalogRequestPayload;
  "plugin.catalog.response": PluginCatalogResponsePayload;
};

type MessageByType<K extends keyof ProtocolPayloadByType> = ProtocolEnvelope<
  K,
  ProtocolPayloadByType[K]
>;

export type SynraRuntimeMessage =
  | MessageByType<"runtime.request">
  | MessageByType<"runtime.received">
  | MessageByType<"runtime.started">
  | MessageByType<"runtime.finished">
  | MessageByType<"runtime.error">;

export type SynraPluginSyncMessage =
  | MessageByType<"plugin.catalog.request">
  | MessageByType<"plugin.catalog.response">;

export type SynraProtocolMessage = SynraRuntimeMessage | SynraPluginSyncMessage;

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

export function createProtocolMessage<TType extends keyof ProtocolPayloadByType>(
  input: Omit<ProtocolEnvelope<TType, ProtocolPayloadByType[TType]>, "protocolVersion">,
): ProtocolEnvelope<TType, ProtocolPayloadByType[TType]> {
  return {
    ...input,
    protocolVersion: PROTOCOL_VERSION,
  };
}
