import { defineAsyncComponent } from "vue";
import type { Router } from "vue-router";
import { builtinChatPlugin } from "./builtin/chat";

type PluginRuntimeState = "idle" | "entering" | "active" | "exiting";
type PluginPageLoader = () => Promise<{ default: unknown }>;
type PluginPageRegistry = {
  register(pagePath: string, loader: PluginPageLoader): void;
  unregister(pagePath: string): void;
};
export type SynraUiPlugin = {
  pluginId: string;
  packageName: string;
  version: string;
  title: string;
  builtin: boolean;
  defaultPage: string;
  icon?: string;
  onPluginEnter(registry: PluginPageRegistry): void | Promise<void>;
  onPluginExit(registry: PluginPageRegistry): void | Promise<void>;
};

type RegisteredPage = {
  pagePath: string;
  routeName: string;
  loader: PluginPageLoader;
};

const pluginRegistry = new Map<string, SynraUiPlugin>([
  [builtinChatPlugin.pluginId, builtinChatPlugin],
]);
const pluginStates = new Map<string, PluginRuntimeState>();
const pluginPages = new Map<string, Map<string, RegisteredPage>>();

function normalizePluginPagePath(pagePath: string): string {
  const normalized = pagePath.startsWith("/") ? pagePath : `/${pagePath}`;
  return normalized.replace(/\/+/g, "/");
}

function toPageKey(pagePath: string): string {
  return normalizePluginPagePath(pagePath).replace(/^\//, "");
}

function toRouteName(pluginId: string, pagePath: string): string {
  return `plugin:${pluginId}:${toPageKey(pagePath)}`;
}

function toRuntimePath(pluginId: string, pagePath: string): string {
  return `/plugin-${pluginId}${normalizePluginPagePath(pagePath)}`;
}

function createRegistry(pluginId: string): PluginPageRegistry {
  return {
    register(pagePath, loader) {
      const normalized = normalizePluginPagePath(pagePath);
      const byPlugin = pluginPages.get(pluginId) ?? new Map<string, RegisteredPage>();
      byPlugin.set(normalized, {
        pagePath: normalized,
        routeName: toRouteName(pluginId, normalized),
        loader,
      });
      pluginPages.set(pluginId, byPlugin);
    },
    unregister(pagePath) {
      const normalized = normalizePluginPagePath(pagePath);
      pluginPages.get(pluginId)?.delete(normalized);
    },
  };
}

function resolveState(pluginId: string): PluginRuntimeState {
  return pluginStates.get(pluginId) ?? "idle";
}

export function listBuiltinPlugins(): SynraUiPlugin[] {
  return [...pluginRegistry.values()];
}

export function registerBuiltinPlugin(plugin: SynraUiPlugin): void {
  pluginRegistry.set(plugin.pluginId, plugin);
}

export async function activatePlugin(router: Router, pluginId: string): Promise<void> {
  const plugin = pluginRegistry.get(pluginId);
  if (!plugin) {
    throw new Error(`Plugin '${pluginId}' is not registered.`);
  }

  if (resolveState(pluginId) === "active") {
    return;
  }

  pluginStates.set(pluginId, "entering");
  const registry = createRegistry(pluginId);
  await plugin.onPluginEnter(registry);
  const pages = pluginPages.get(pluginId) ?? new Map<string, RegisteredPage>();

  for (const page of pages.values()) {
    if (!router.hasRoute(page.routeName)) {
      router.addRoute({
        name: page.routeName,
        path: toRuntimePath(pluginId, page.pagePath),
        component: defineAsyncComponent(page.loader),
        meta: {
          pluginId,
          pluginPagePath: page.pagePath,
        },
      });
    }
  }

  pluginStates.set(pluginId, "active");
}

export async function deactivatePlugin(router: Router, pluginId: string): Promise<void> {
  const plugin = pluginRegistry.get(pluginId);
  if (!plugin || resolveState(pluginId) !== "active") {
    return;
  }

  pluginStates.set(pluginId, "exiting");
  const registry = createRegistry(pluginId);
  await plugin.onPluginExit(registry);
  const pages = pluginPages.get(pluginId) ?? new Map<string, RegisteredPage>();

  for (const page of pages.values()) {
    if (router.hasRoute(page.routeName)) {
      router.removeRoute(page.routeName);
    }
  }

  pluginPages.set(pluginId, new Map<string, RegisteredPage>());
  pluginStates.set(pluginId, "idle");
}

export async function openPluginPage(
  router: Router,
  pluginId: string,
  pagePath: string,
  query?: Record<string, string>,
): Promise<void> {
  await activatePlugin(router, pluginId);
  await router.push({
    path: toRuntimePath(pluginId, pagePath),
    query,
  });
}
