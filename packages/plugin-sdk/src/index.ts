import type {
  SynraActionReceipt,
  SynraActionRequest,
  SynraCrossDeviceMessage,
} from "@synra/protocol";

export type ShareInputType = "text" | "url" | "file";

export type ShareInput = {
  type: ShareInputType;
  raw: string;
  metadata?: Record<string, unknown>;
};

export type PluginMatchResult = {
  matched: boolean;
  score: number;
  reason?: string;
};

export type PluginAction = SynraActionRequest & {
  label: string;
  requiresConfirm: boolean;
};

export type ExecuteContext = {
  deviceId: string;
  sessionId: string;
  traceId: string;
};

export type SynraPlugin = {
  id: string;
  version: string;
  supports(input: ShareInput): Promise<PluginMatchResult>;
  buildActions(input: ShareInput): Promise<PluginAction[]>;
  execute(action: PluginAction, context: ExecuteContext): Promise<SynraActionReceipt>;
};

export function toActionSelectedMessage(
  input: Omit<SynraCrossDeviceMessage<PluginAction>, "type">,
): SynraCrossDeviceMessage<PluginAction> {
  return {
    ...input,
    type: "action.selected",
  };
}
