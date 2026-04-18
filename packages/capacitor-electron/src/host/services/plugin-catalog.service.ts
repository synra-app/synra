import type { PluginCatalogRequestPayload } from "@synra/protocol";
import type { SynraPlugin } from "@synra/plugin-sdk";
import type { PluginCatalogResult } from "../../shared/protocol/types";
import type { PluginRuntimeService } from "./plugin-runtime.service";

export type PluginCatalogService = {
  getCatalog(request?: PluginCatalogRequestPayload): Promise<PluginCatalogResult>;
};

const BUILTIN_CHAT_PACKAGE = "@synra-plugin/chat";

function toBuiltInChatCatalogItem() {
  return {
    pluginId: "chat",
    version: "0.1.0",
    displayName: "Chat",
    status: "installed" as const,
    builtin: true,
    defaultPage: "home",
    icon: "i-lucide-message-circle",
    packageName: BUILTIN_CHAT_PACKAGE,
  };
}

function parsePluginIdFromPackageName(packageName: string): string | null {
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

type PluginMetadata = {
  packageName?: string;
  displayName?: string;
  builtin?: boolean;
  defaultPage?: string;
  icon?: string;
};

function getPluginMetadata(plugin: SynraPlugin): PluginMetadata | undefined {
  const pluginWithMeta = plugin as SynraPlugin & { meta?: PluginMetadata };
  return pluginWithMeta.meta;
}

type CatalogPluginRecord = {
  pluginId: string;
  packageName?: string;
  version: string;
  displayName: string;
  status: "installed" | "available";
  builtin: boolean;
  defaultPage: string;
  icon?: string;
};

export function createPluginCatalogService(
  pluginRuntimeService: PluginRuntimeService,
): PluginCatalogService {
  return {
    async getCatalog(request: PluginCatalogRequestPayload = {}): Promise<PluginCatalogResult> {
      const catalogMap = new Map<string, CatalogPluginRecord>(
        [toBuiltInChatCatalogItem()].map((item) => [item.pluginId, item] as const),
      );

      for (const plugin of pluginRuntimeService.listPlugins()) {
        const metadata = getPluginMetadata(plugin);
        const packageName = metadata?.packageName;
        const parsedPluginId = packageName ? parsePluginIdFromPackageName(packageName) : null;
        const pluginId = parsedPluginId ?? plugin.id;
        catalogMap.set(pluginId, {
          pluginId,
          packageName,
          version: plugin.version,
          displayName: metadata?.displayName ?? plugin.id,
          status: "installed",
          builtin: metadata?.builtin ?? false,
          defaultPage: metadata?.defaultPage ?? "home",
          icon: metadata?.icon,
        });
      }

      const known = new Set(request.knownPluginIds ?? []);
      const plugins = [...catalogMap.values()]
        .filter((plugin) => !known.has(plugin.pluginId))
        .map((plugin) => ({
          pluginId: plugin.pluginId,
          packageName: plugin.packageName,
          version: plugin.version,
          displayName: plugin.displayName,
          status: plugin.status,
          builtin: plugin.builtin,
          defaultPage: plugin.defaultPage,
          icon: plugin.icon,
        }));

      return {
        plugins,
        generatedAt: Date.now(),
      };
    },
  };
}
