import type { PluginAction, ShareInput } from "@synra/plugin-sdk";
import type { PluginCatalogItem, SynraActionReceipt, SynraRuntimeMessage } from "@synra/protocol";
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

export type RuntimeActionCandidate = {
  pluginId: string;
  pluginVersion: string;
  pluginLabel: string;
  score: number;
  reason?: string;
  action: PluginAction;
};

export type ResolveRuntimeActionsOptions = {
  input: ShareInput;
};

export type ResolveRuntimeActionsResult = {
  candidates: RuntimeActionCandidate[];
};

export type RuntimeExecuteOptions = {
  sessionId: string;
  input: ShareInput;
  action: PluginAction;
  messageId?: string;
  traceId?: string;
  timeoutMs?: number;
};

export type RuntimeExecuteResult = {
  messages: SynraRuntimeMessage[];
  receipt: SynraActionReceipt;
};

export type PluginCatalogResult = {
  plugins: PluginCatalogItem[];
};

export type MethodPayloadMap = {
  "runtime.getInfo": Record<string, never>;
  "runtime.resolveActions": ResolveRuntimeActionsOptions;
  "runtime.execute": RuntimeExecuteOptions;
  "plugin.catalog.get": Record<string, never>;
  "external.open": OpenExternalOptions;
  "file.read": ReadFileOptions;
};

export type MethodResultMap = {
  "runtime.getInfo": RuntimeInfo;
  "runtime.resolveActions": ResolveRuntimeActionsResult;
  "runtime.execute": RuntimeExecuteResult;
  "plugin.catalog.get": PluginCatalogResult;
  "external.open": OperationResult;
  "file.read": ReadFileResult;
};
