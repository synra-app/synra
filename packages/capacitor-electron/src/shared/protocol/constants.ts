export const BRIDGE_PROTOCOL_VERSION = "1.0" as const;

export const BRIDGE_SUPPORTED_PROTOCOL_VERSIONS = [BRIDGE_PROTOCOL_VERSION] as const;

export const BRIDGE_INVOKE_CHANNEL = "synra:cap-electron:v1:invoke" as const;

export const BRIDGE_CHANNEL_WHITELIST = [BRIDGE_INVOKE_CHANNEL] as const;

export const BRIDGE_METHODS = {
  runtimeGetInfo: "runtime.getInfo",
  runtimeResolveActions: "runtime.resolveActions",
  runtimeExecute: "runtime.execute",
  pluginCatalogGet: "plugin.catalog.get",
  externalOpen: "external.open",
  fileRead: "file.read",
} as const;

export type BridgeMethod = (typeof BRIDGE_METHODS)[keyof typeof BRIDGE_METHODS];
