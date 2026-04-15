import { expect, test } from "vite-plus/test";
import { toActionSelectedMessage } from "../src/index.ts";

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
      label: "在电脑浏览器打开",
      requiresConfirm: true,
      payload: { url: "https://github.com/imba97/smserialport" },
    },
  });

  expect(message.type).toBe("action.selected");
});
