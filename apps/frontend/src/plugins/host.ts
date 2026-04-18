import {
  normalizePluginPagePath,
  type PluginPageRegistry,
  type SynraUiPlugin,
} from "@synra/plugin-sdk";
import type { Router } from "vue-router";
import { builtinChatPlugin } from "./builtin/chat";

type PluginRuntimeState = "idle" | "entering" | "active" | "exiting";

type RegisteredPage = {
  pagePath: string;
  routeName: string;
  loader: () => Promise<{ default: unknown }>;
};

class PluginRegistry {
  private readonly plugins = new Map<string, SynraUiPlugin>();

  constructor(initialPlugins: SynraUiPlugin[] = []) {
    for (const plugin of initialPlugins) {
      this.plugins.set(plugin.pluginId, plugin);
    }
  }

  list(): SynraUiPlugin[] {
    return [...this.plugins.values()];
  }

  register(plugin: SynraUiPlugin): void {
    this.plugins.set(plugin.pluginId, plugin);
  }

  get(pluginId: string): SynraUiPlugin | undefined {
    return this.plugins.get(pluginId);
  }
}

class PluginRouteBinder {
  private readonly pagesByPlugin = new Map<string, Map<string, RegisteredPage>>();

  createRegistry(pluginId: string): PluginPageRegistry {
    return {
      register: (pagePath, loader) => {
        const normalized = normalizePluginPagePath(pagePath);
        const byPlugin = this.pagesByPlugin.get(pluginId) ?? new Map<string, RegisteredPage>();
        byPlugin.set(normalized, {
          pagePath: normalized,
          routeName: this.toRouteName(pluginId, normalized),
          loader,
        });
        this.pagesByPlugin.set(pluginId, byPlugin);
      },
      unregister: (pagePath) => {
        const normalized = normalizePluginPagePath(pagePath);
        this.pagesByPlugin.get(pluginId)?.delete(normalized);
      },
    };
  }

  attachRoutes(router: Router, pluginId: string): void {
    const pages = this.pagesByPlugin.get(pluginId) ?? new Map<string, RegisteredPage>();
    for (const page of pages.values()) {
      if (router.hasRoute(page.routeName)) {
        continue;
      }
      router.addRoute({
        name: page.routeName,
        path: this.toRuntimePath(pluginId, page.pagePath),
        component: page.loader,
        meta: {
          pluginId,
          pluginPagePath: page.pagePath,
        },
      });
    }
  }

  detachRoutes(router: Router, pluginId: string): void {
    const pages = this.pagesByPlugin.get(pluginId) ?? new Map<string, RegisteredPage>();
    for (const page of pages.values()) {
      if (router.hasRoute(page.routeName)) {
        router.removeRoute(page.routeName);
      }
    }
    this.pagesByPlugin.set(pluginId, new Map<string, RegisteredPage>());
  }

  resolveRuntimePath(pluginId: string, pagePath: string): string {
    return this.toRuntimePath(pluginId, pagePath);
  }

  private toPageKey(pagePath: string): string {
    return normalizePluginPagePath(pagePath).replace(/^\//, "");
  }

  private toRouteName(pluginId: string, pagePath: string): string {
    return `plugin:${pluginId}:${this.toPageKey(pagePath)}`;
  }

  private toRuntimePath(pluginId: string, pagePath: string): string {
    return `/plugin-${pluginId}${normalizePluginPagePath(pagePath)}`;
  }
}

class PluginLifecycleManager {
  private readonly pluginStates = new Map<string, PluginRuntimeState>();

  constructor(
    private readonly registry: PluginRegistry,
    private readonly routeBinder: PluginRouteBinder,
  ) {}

  resolveState(pluginId: string): PluginRuntimeState {
    return this.pluginStates.get(pluginId) ?? "idle";
  }

  async activate(router: Router, pluginId: string): Promise<void> {
    const plugin = this.registry.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin '${pluginId}' is not registered.`);
    }
    if (this.resolveState(pluginId) === "active") {
      return;
    }
    this.pluginStates.set(pluginId, "entering");
    await plugin.onPluginEnter(this.routeBinder.createRegistry(pluginId));
    this.routeBinder.attachRoutes(router, pluginId);
    this.pluginStates.set(pluginId, "active");
  }

  async deactivate(router: Router, pluginId: string): Promise<void> {
    const plugin = this.registry.get(pluginId);
    if (!plugin || this.resolveState(pluginId) !== "active") {
      return;
    }
    this.pluginStates.set(pluginId, "exiting");
    await plugin.onPluginExit(this.routeBinder.createRegistry(pluginId));
    this.routeBinder.detachRoutes(router, pluginId);
    this.pluginStates.set(pluginId, "idle");
  }
}

export class PluginHostFacade {
  private readonly registry = new PluginRegistry([builtinChatPlugin]);
  private readonly routeBinder = new PluginRouteBinder();
  private readonly lifecycle = new PluginLifecycleManager(this.registry, this.routeBinder);

  listBuiltinPlugins(): SynraUiPlugin[] {
    return this.registry.list();
  }

  registerBuiltinPlugin(plugin: SynraUiPlugin): void {
    this.registry.register(plugin);
  }

  activatePlugin(router: Router, pluginId: string): Promise<void> {
    return this.lifecycle.activate(router, pluginId);
  }

  deactivatePlugin(router: Router, pluginId: string): Promise<void> {
    return this.lifecycle.deactivate(router, pluginId);
  }

  async openPluginPage(
    router: Router,
    pluginId: string,
    pagePath: string,
    query?: Record<string, string>,
  ): Promise<void> {
    await this.activatePlugin(router, pluginId);
    await router.push({
      path: this.routeBinder.resolveRuntimePath(pluginId, pagePath),
      query,
    });
  }
}

const defaultHostFacade = new PluginHostFacade();

export function listBuiltinPlugins(): SynraUiPlugin[] {
  return defaultHostFacade.listBuiltinPlugins();
}

export function registerBuiltinPlugin(plugin: SynraUiPlugin): void {
  defaultHostFacade.registerBuiltinPlugin(plugin);
}

export function activatePlugin(router: Router, pluginId: string): Promise<void> {
  return defaultHostFacade.activatePlugin(router, pluginId);
}

export function deactivatePlugin(router: Router, pluginId: string): Promise<void> {
  return defaultHostFacade.deactivatePlugin(router, pluginId);
}

export function openPluginPage(
  router: Router,
  pluginId: string,
  pagePath: string,
  query?: Record<string, string>,
): Promise<void> {
  return defaultHostFacade.openPluginPage(router, pluginId, pagePath, query);
}
