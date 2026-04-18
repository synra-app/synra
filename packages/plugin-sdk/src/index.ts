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
  meta?: {
    packageName?: string;
    displayName?: string;
    builtin?: boolean;
    defaultPage?: string;
    icon?: string;
  };
  supports(input: ShareInput): Promise<PluginMatchResult>;
  buildActions(input: ShareInput): Promise<PluginAction[]>;
  execute(action: PluginAction, context: ExecuteContext): Promise<SynraActionReceipt>;
};

export type SynraPluginPackageName = `@synra-plugin/${string}` | `synra-plugin-${string}`;

export type SynraPluginManifest = {
  name: string;
  version: string;
  synra?: {
    title?: string;
    description?: string;
    defaultPage?: string;
    builtin?: boolean;
    icon?: string;
  };
};

export type PluginPageLoader = () => Promise<{ default: unknown }>;

export type PluginPageRegistry = {
  register(pagePath: string, loader: PluginPageLoader): void;
  unregister(pagePath: string): void;
};

export type SynraUiPlugin = {
  pluginId: string;
  packageName: SynraPluginPackageName;
  version: string;
  title: string;
  builtin: boolean;
  defaultPage: string;
  icon?: string;
  onPluginEnter(registry: PluginPageRegistry): void | Promise<void>;
  onPluginExit(registry: PluginPageRegistry): void | Promise<void>;
};

export function toActionSelectedMessage(
  input: Omit<SynraCrossDeviceMessage<PluginAction>, "type">,
): SynraCrossDeviceMessage<PluginAction> {
  return {
    ...input,
    type: "action.selected",
  };
}

export function parsePluginIdFromPackageName(packageName: string): string | null {
  const scopedPrefix = "@synra-plugin/";
  const unscopedPrefix = "synra-plugin-";
  let candidate = "";

  if (packageName.startsWith(scopedPrefix)) {
    candidate = packageName.slice(scopedPrefix.length);
  } else if (packageName.startsWith(unscopedPrefix)) {
    candidate = packageName.slice(unscopedPrefix.length);
  } else {
    return null;
  }

  if (!/^[a-z0-9-]+$/.test(candidate)) {
    return null;
  }

  return candidate;
}

export function normalizePluginPagePath(pagePath: string): string {
  const normalized = pagePath.startsWith("/") ? pagePath : `/${pagePath}`;
  return normalized.replace(/\/+/g, "/");
}
