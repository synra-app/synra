import { createElectronBridgePluginFromGlobal } from "@synra/capacitor-electron/api/plugin";
import type { Router } from "vue-router";
import { activatePlugin } from "./host";

const CACHE_KEY = "synra.plugin.install.cache.v1";

export type PluginInstallStage =
  | "sync-catalog"
  | "download-assets"
  | "validate-assets"
  | "cache-assets"
  | "activate-plugin";

export type PluginInstallRecord = {
  pluginId: string;
  version: string;
  checksum: string;
  installedAt: number;
  assetKey: string;
};

type PluginInstallMap = Record<string, PluginInstallRecord>;

function readInstallCache(): PluginInstallMap {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as PluginInstallMap;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function writeInstallCache(cache: PluginInstallMap): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

async function sha256(input: string): Promise<string> {
  if (!crypto.subtle) {
    return btoa(input);
  }

  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function installPluginOnClient(options: {
  router: Router;
  pluginId: string;
  version: string;
  assetKey?: string;
  onStageChange?: (stage: PluginInstallStage) => void;
}): Promise<PluginInstallRecord> {
  options.onStageChange?.("sync-catalog");
  if (window.__synraCapElectron?.invoke) {
    const bridge = createElectronBridgePluginFromGlobal();
    await bridge.getPluginCatalog({ knownPluginIds: [] });
  }

  const assetKey = options.assetKey ?? `builtin:${options.pluginId}:${options.version}`;
  options.onStageChange?.("download-assets");
  const downloadedAssetRef = assetKey;

  options.onStageChange?.("validate-assets");
  const checksum = await sha256(
    `${options.pluginId}:${options.version}:${downloadedAssetRef}:${Date.now()}`,
  );

  options.onStageChange?.("cache-assets");
  const cache = readInstallCache();
  const record: PluginInstallRecord = {
    pluginId: options.pluginId,
    version: options.version,
    checksum,
    installedAt: Date.now(),
    assetKey: downloadedAssetRef,
  };
  cache[options.pluginId] = record;
  writeInstallCache(cache);

  options.onStageChange?.("activate-plugin");
  await activatePlugin(options.router, options.pluginId);
  return record;
}

export function getInstalledPluginRecord(pluginId: string): PluginInstallRecord | null {
  return readInstallCache()[pluginId] ?? null;
}
