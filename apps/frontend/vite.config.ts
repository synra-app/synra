import UnoCSS from "@unocss/vite";
import Vue from "@vitejs/plugin-vue";
import { dirname } from "path";
import { fileURLToPath, resolve } from "url";
import { defineConfig } from "vite-plus";
import VueRouter from "vue-router/vite";

const r = (p: string) => resolve(dirname(fileURLToPath(import.meta.url)), p);

export default defineConfig({
  plugins: [
    VueRouter({
      dts: r(".auto-generated/typed-router.d.ts"),
    }),
    Vue(),
    UnoCSS(),
  ],
});
