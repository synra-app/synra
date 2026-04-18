import { expect, test } from "vite-plus/test";
import {
  normalizePluginPagePath,
  parsePluginIdFromPackageName,
  toActionSelectedMessage,
} from "../src/index.ts";

test("toActionSelectedMessage should enforce action.selected type", () => {
  const message = toActionSelectedMessage({
    protocolVersion: "1.0",
    messageId: "m1",
    sessionId: "s1",
    traceId: "t1",
    sentAt: Date.now(),
    ttlMs: 30_000,
    fromDeviceId: "mobile-1",
    toDeviceId: "pc-1",
    payload: {
      actionId: "a1",
      pluginId: "github-open",
      actionType: "openInBrowser",
      label: "Open in desktop browser",
      requiresConfirm: true,
      payload: { url: "https://github.com/imba97/smserialport" },
    },
  });

  expect(message.type).toBe("action.selected");
});

test("parsePluginIdFromPackageName supports scoped and unscoped names", () => {
  expect(parsePluginIdFromPackageName("@synra-plugin/chat")).toBe("chat");
  expect(parsePluginIdFromPackageName("synra-plugin-my-tool")).toBe("my-tool");
  expect(parsePluginIdFromPackageName("@foo/chat")).toBeNull();
  expect(parsePluginIdFromPackageName("@synra-plugin/Chat")).toBeNull();
});

test("normalizePluginPagePath always returns normalized absolute path", () => {
  expect(normalizePluginPagePath("home")).toBe("/home");
  expect(normalizePluginPagePath("/home")).toBe("/home");
  expect(normalizePluginPagePath("//home//index")).toBe("/home/index");
});
