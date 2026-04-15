import { expect, test } from "vite-plus/test";
import { PROTOCOL_VERSION, createMessage } from "../src/index.ts";

test("createMessage injects protocol version", () => {
  const message = createMessage({
    messageId: "m1",
    sessionId: "s1",
    traceId: "t1",
    type: "action.selected",
    sentAt: Date.now(),
    ttlMs: 30_000,
    fromDeviceId: "mobile-1",
    toDeviceId: "pc-1",
    payload: { actionId: "a1" },
  });

  expect(message.protocolVersion).toBe(PROTOCOL_VERSION);
});
