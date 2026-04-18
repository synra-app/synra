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

export type DiscoverySource = "mdns" | "probe" | "manual";

export type DiscoveryState = "idle" | "scanning";

export type DiscoveredDevice = {
  deviceId: string;
  name: string;
  ipAddress: string;
  source: DiscoverySource;
  paired: boolean;
  connectable: boolean;
  connectCheckAt?: number;
  connectCheckError?: string;
  discoveredAt: number;
  lastSeenAt: number;
};

export type DeviceDiscoveryStartOptions = {
  includeLoopback?: boolean;
  manualTargets?: string[];
  enableProbeFallback?: boolean;
  reset?: boolean;
  scanWindowMs?: number;
  port?: number;
  timeoutMs?: number;
};

export type DeviceDiscoveryStartResult = {
  requestId: string;
  state: DiscoveryState;
  startedAt?: number;
  scanWindowMs: number;
  devices: DiscoveredDevice[];
};

export type DeviceDiscoveryListResult = {
  state: DiscoveryState;
  startedAt?: number;
  scanWindowMs: number;
  devices: DiscoveredDevice[];
};

export type DeviceDiscoveryPairOptions = {
  deviceId: string;
};

export type DeviceDiscoveryPairResult = {
  success: true;
  device: DiscoveredDevice;
};

export type DeviceDiscoveryProbeConnectableOptions = {
  port?: number;
  timeoutMs?: number;
};

export type DeviceDiscoveryProbeConnectableResult = {
  checkedAt: number;
  port: number;
  timeoutMs: number;
  devices: DiscoveredDevice[];
};

export type DeviceSessionOpenOptions = {
  deviceId: string;
  host: string;
  port: number;
  token?: string;
};

export type DeviceSessionState = "idle" | "connecting" | "open" | "closed" | "error";

export type DeviceSessionSnapshot = {
  sessionId?: string;
  deviceId?: string;
  host?: string;
  port?: number;
  state: DeviceSessionState;
  lastError?: string;
  openedAt?: number;
  closedAt?: number;
};

export type DeviceSessionOpenResult = {
  success: true;
  sessionId: string;
  state: DeviceSessionState;
};

export type DeviceSessionCloseOptions = {
  sessionId?: string;
};

export type DeviceSessionCloseResult = {
  success: true;
  sessionId?: string;
};

export type DeviceSessionSendMessageOptions = {
  sessionId: string;
  type: string;
  payload: string | Record<string, unknown>;
  messageId?: string;
};

export type DeviceSessionSendMessageResult = {
  success: true;
  messageId: string;
  sessionId: string;
};

export type DeviceSessionGetStateOptions = {
  sessionId?: string;
};

export type DeviceDiscoveryHostEvent = {
  id: number;
  timestamp: number;
  type: "clientConnected" | "clientClosed" | "messageReceived";
  remote: string;
  sessionId?: string;
  messageId?: string;
  payload?: unknown;
};

export type DeviceDiscoveryPullHostEventsResult = {
  events: DeviceDiscoveryHostEvent[];
};

export type MethodPayloadMap = {
  "runtime.getInfo": Record<string, never>;
  "runtime.resolveActions": ResolveRuntimeActionsOptions;
  "runtime.execute": RuntimeExecuteOptions;
  "plugin.catalog.get": Record<string, never>;
  "external.open": OpenExternalOptions;
  "file.read": ReadFileOptions;
  "discovery.start": DeviceDiscoveryStartOptions;
  "discovery.stop": Record<string, never>;
  "discovery.list": Record<string, never>;
  "discovery.pair": DeviceDiscoveryPairOptions;
  "discovery.probeConnectable": DeviceDiscoveryProbeConnectableOptions;
  "discovery.openSession": DeviceSessionOpenOptions;
  "discovery.closeSession": DeviceSessionCloseOptions;
  "discovery.sendMessage": DeviceSessionSendMessageOptions;
  "discovery.getSessionState": DeviceSessionGetStateOptions;
  "discovery.pullHostEvents": Record<string, never>;
};

export type MethodResultMap = {
  "runtime.getInfo": RuntimeInfo;
  "runtime.resolveActions": ResolveRuntimeActionsResult;
  "runtime.execute": RuntimeExecuteResult;
  "plugin.catalog.get": PluginCatalogResult;
  "external.open": OperationResult;
  "file.read": ReadFileResult;
  "discovery.start": DeviceDiscoveryStartResult;
  "discovery.stop": OperationResult;
  "discovery.list": DeviceDiscoveryListResult;
  "discovery.pair": DeviceDiscoveryPairResult;
  "discovery.probeConnectable": DeviceDiscoveryProbeConnectableResult;
  "discovery.openSession": DeviceSessionOpenResult;
  "discovery.closeSession": DeviceSessionCloseResult;
  "discovery.sendMessage": DeviceSessionSendMessageResult;
  "discovery.getSessionState": DeviceSessionSnapshot;
  "discovery.pullHostEvents": DeviceDiscoveryPullHostEventsResult;
};
