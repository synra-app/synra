import { describe, expect, test } from "vite-plus/test";
import type { PluginAction, SynraActionPlugin } from "@synra/plugin-sdk";
import { createPluginRuntimeService } from "../../../src/host/services/plugin-runtime.service";

function createTestPlugin(shouldFail: boolean = false): SynraActionPlugin {
  return {
    id: "test-plugin",
    version: "1.0.0",
    async supports(input) {
      return {
        matched: input.raw.includes("github"),
        score: 88,
      };
    },
    async buildActions() {
      return [
        {
          actionId: "test-plugin:open",
          pluginId: "test-plugin",
          actionType: "external.open-url",
          label: "Open in browser",
          requiresConfirm: true,
          payload: { url: "https://github.com/synra" },
        },
      ];
    },
    async execute(action) {
      if (shouldFail) {
        return {
          ok: false as const,
          actionId: action.actionId,
          handledBy: "test-plugin",
          durationMs: 2,
          retryable: false,
          error: {
            code: "RUNTIME_EXECUTION_FAILED" as const,
            message: "execution failed",
          },
        };
      }

      return {
        ok: true as const,
        actionId: action.actionId,
        handledBy: "test-plugin",
        durationMs: 2,
        output: { opened: true },
      };
    },
  };
}

function buildAction(): PluginAction {
  return {
    actionId: "test-plugin:open",
    pluginId: "test-plugin",
    actionType: "external.open-url",
    label: "Open in browser",
    requiresConfirm: true,
    payload: { url: "https://github.com/synra" },
  };
}

describe("host/services/plugin-runtime.service", () => {
  test("resolves actions from registered plugins", async () => {
    const runtime = createPluginRuntimeService();
    runtime.register(createTestPlugin());

    const result = await runtime.resolveActions({
      type: "url",
      raw: "https://github.com/synra",
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.pluginId).toBe("test-plugin");
  });

  test("executes selected action and emits runtime lifecycle messages", async () => {
    const runtime = createPluginRuntimeService();
    runtime.register(createTestPlugin());
    const seenTypes: string[] = [];

    const result = await runtime.executeSelected({
      sessionId: "session-1",
      input: { type: "url", raw: "https://github.com/synra" },
      action: buildAction(),
      emitMessage: (message) => {
        seenTypes.push(message.type);
      },
    });

    expect(result.receipt.ok).toBe(true);
    expect(seenTypes).toEqual(["runtime.received", "runtime.started", "runtime.finished"]);
  });

  test("returns failed finished status when plugin execution fails", async () => {
    const runtime = createPluginRuntimeService();
    runtime.register(createTestPlugin(true));

    const result = await runtime.executeSelected({
      sessionId: "session-1",
      input: { type: "url", raw: "https://github.com/synra" },
      action: buildAction(),
    });

    expect(result.receipt.ok).toBe(false);
    const finalMessage = result.messages[result.messages.length - 1];
    expect(finalMessage?.type).toBe("runtime.finished");
    if (finalMessage?.type === "runtime.finished") {
      expect(finalMessage.payload.status).toBe("failed");
    }
  });
});
