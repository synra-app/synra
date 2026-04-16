import { describe, expect, test } from "vite-plus/test";
import type { SynraPlugin } from "@synra/plugin-sdk";
import { createPluginCatalogService } from "../../../src/host/services/plugin-catalog.service";
import { createPluginRuntimeService } from "../../../src/host/services/plugin-runtime.service";

describe("host/services/plugin-catalog.service", () => {
  test("returns plugin entries from runtime registry", async () => {
    const runtime = createPluginRuntimeService();
    const plugin: SynraPlugin = {
      id: "github-open",
      version: "0.1.0",
      async supports() {
        return { matched: true, score: 100 };
      },
      async buildActions() {
        return [];
      },
      async execute() {
        return {
          ok: true as const,
          actionId: "a1",
          handledBy: "github-open",
          durationMs: 1,
        };
      },
    };
    runtime.register(plugin);
    const catalogService = createPluginCatalogService(runtime);

    const catalog = await catalogService.getCatalog();

    expect(catalog.plugins).toEqual([
      {
        pluginId: "github-open",
        version: "0.1.0",
        displayName: "github-open",
      },
    ]);
  });
});
