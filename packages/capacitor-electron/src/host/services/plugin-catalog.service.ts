import type { PluginCatalogResult } from "../../shared/protocol/types";
import type { PluginRuntimeService } from "./plugin-runtime.service";

export type PluginCatalogService = {
  getCatalog(): Promise<PluginCatalogResult>;
};

export function createPluginCatalogService(
  pluginRuntimeService: PluginRuntimeService,
): PluginCatalogService {
  return {
    async getCatalog(): Promise<PluginCatalogResult> {
      const plugins = pluginRuntimeService.listPlugins().map((plugin) => ({
        pluginId: plugin.id,
        version: plugin.version,
        displayName: plugin.id,
      }));

      return { plugins };
    },
  };
}
