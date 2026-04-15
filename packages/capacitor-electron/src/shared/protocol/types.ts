import type { BridgeErrorCode } from "../errors/codes";
import type { BridgeMethod } from "./constants";

export type BridgeRequestMeta = {
  timeoutMs?: number;
  source?: "capacitor-webview";
  traceId?: string;
};

export type BridgeRequest<TPayload = unknown> = {
  protocolVersion: string;
  requestId: string;
  method: BridgeMethod | (string & {});
  payload: TPayload;
  meta?: BridgeRequestMeta;
};

export type BridgeSuccessResponse<TData = unknown> = {
  ok: true;
  requestId: string;
  data: TData;
};

export type BridgeErrorResponse = {
  ok: false;
  requestId: string;
  error: {
    code: BridgeErrorCode;
    message: string;
    details?: unknown;
  };
};

export type BridgeResponse<TData = unknown> = BridgeSuccessResponse<TData> | BridgeErrorResponse;

export type RuntimeInfo = {
  protocolVersion: string;
  supportedProtocolVersions: string[];
  capacitorVersion: string;
  electronVersion: string;
  nodeVersion: string;
  platform: NodeJS.Platform;
  capabilities: string[];
};

export type OperationResult = {
  success: true;
};

export type OpenExternalOptions = {
  url: string;
};

export type ReadFileOptions = {
  path: string;
  encoding?: BufferEncoding;
};

export type ReadFileResult = {
  content: string;
  encoding: BufferEncoding;
};

export type MethodPayloadMap = {
  "runtime.getInfo": Record<string, never>;
  "external.open": OpenExternalOptions;
  "file.read": ReadFileOptions;
};

export type MethodResultMap = {
  "runtime.getInfo": RuntimeInfo;
  "external.open": OperationResult;
  "file.read": ReadFileResult;
};
