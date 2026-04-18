import type { SynraUiPlugin } from "../host";

export const builtinChatPlugin: SynraUiPlugin = {
  pluginId: "chat",
  packageName: "@synra-plugin/chat",
  version: "0.1.0",
  title: "Chat",
  builtin: true,
  defaultPage: "home",
  icon: "i-lucide-message-circle",
  onPluginEnter(registry) {
    registry.register("/home", () => import("../pages/chat/home.vue"));
  },
  onPluginExit(registry) {
    registry.unregister("/home");
  },
};
