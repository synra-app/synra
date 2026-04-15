import UnoCSS from "@unocss/vite";
import Vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite-plus";
import VueRouter from "vue-router/vite";

export default defineConfig({
  plugins: [VueRouter(), Vue(), UnoCSS()],
});
