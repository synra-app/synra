import UnoCSS from "@unocss/vite";
import Vue from "@vitejs/plugin-vue";
import { fileURLToPath, resolve } from "url";
import { defineConfig, type PluginOption } from "vite-plus";
import VueRouter from "vue-router/vite";

const r = (p: string) => resolve(fileURLToPath(import.meta.url), p);

export default defineConfig({
  plugins: [
    VueRouter({ dts: r(".auto-generated/typed-router.d.ts") }) as unknown as PluginOption,
    Vue() as unknown as PluginOption,
    UnoCSS() as unknown as PluginOption,
  ],
});
