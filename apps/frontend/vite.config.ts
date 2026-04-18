import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import UnoCSS from "@unocss/vite";
import Vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { resolve } from "url";
import { defineConfig, type PluginOption } from "vite-plus";
import VueRouter from "vue-router/vite";

const r = (p: string) => resolve(fileURLToPath(import.meta.url), p);
const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const packageJsonPath = resolve(projectRoot, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
  name?: string;
  version?: string;
};

function getGitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

const buildMeta = {
  appName: packageJson.name ?? "frontend",
  appVersion: packageJson.version ?? "0.0.0",
  buildTime: new Date().toISOString(),
  gitSha: getGitSha(),
};

export default defineConfig({
  define: {
    __APP_NAME__: JSON.stringify(buildMeta.appName),
    __APP_VERSION__: JSON.stringify(buildMeta.appVersion),
    __APP_BUILD_TIME__: JSON.stringify(buildMeta.buildTime),
    __APP_GIT_SHA__: JSON.stringify(buildMeta.gitSha),
  },
  plugins: [
    VueRouter({ dts: r(".auto-generated/typed-router.d.ts") }) as unknown as PluginOption,
    Vue() as unknown as PluginOption,
    AutoImport({
      imports: ["vue", "vue-router", "pinia"],
      dirs: [r("src/composables")],
      dts: r(".auto-generated/auto-imports.d.ts"),
      vueTemplate: true,
    }) as unknown as PluginOption,
    Components({
      dirs: [r("src/components")],
      extensions: ["vue"],
      dts: r(".auto-generated/components.d.ts"),
      deep: true,
    }) as unknown as PluginOption,
    UnoCSS() as unknown as PluginOption,
  ],
});
