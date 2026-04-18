import "uno.css";
import "./styles/main.scss";
import { Capacitor } from "@capacitor/core";
import { installElectronCapacitor } from "@synra/capacitor-electron/capacitor";
import { createPinia } from "pinia";
import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { routes } from "vue-router/auto-routes";
import App from "./App.vue";

installElectronCapacitor({ capacitor: Capacitor });

const router = createRouter({
  history: createWebHistory(),
  routes,
});

createApp(App).use(createPinia()).use(router).mount("#app");
