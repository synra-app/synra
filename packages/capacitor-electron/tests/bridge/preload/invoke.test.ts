import { describe, expect, test } from "vite-plus/test";
import { createPreloadInvoker } from "../../../src/bridge/preload/invoke";
import { BRIDGE_ERROR_CODES } from "../../../src/shared/errors/codes";
import { BRIDGE_METHODS, BRIDGE_PROTOCOL_VERSION } from "../../../src/shared/protocol/constants";

describe("bridge/preload/invoke", () => {
  test("sends request to fixed invoke channel", async () => {
    let seenChannel = "";
    const invoke = createPreloadInvoker(async (channel, request) => {
      seenChannel = channel;
      return {
        ok: true as const,
        requestId: request.requestId,
        data: {
          protocolVersion: BRIDGE_PROTOCOL_VERSION,
          supportedProtocolVersions: [BRIDGE_PROTOCOL_VERSION],
          capacitorVersion: "8.0.0",
          electronVersion: "34.0.0",
          nodeVersion: process.versions.node,
          platform: process.platform,
          capabilities: ["runtime.getInfo"],
        },
      };
    });

    await invoke(BRIDGE_METHODS.runtimeGetInfo, {});
    expect(seenChannel).toBe("synra:cap-electron:v1:invoke");
  });

  test("throws INVALID_PARAMS when payload is invalid", async () => {
    const invoke = createPreloadInvoker(async () => {
      throw new Error("should not be called");
    });

    await expect(invoke(BRIDGE_METHODS.externalOpen, {} as never)).rejects.toMatchObject({
      code: BRIDGE_ERROR_CODES.invalidParams,
    });
  });

  test("throws bridge error when response shape is invalid", async () => {
    const invoke = createPreloadInvoker(async () => ({ bad: true }));

    await expect(invoke(BRIDGE_METHODS.runtimeGetInfo, {})).rejects.toMatchObject({
      code: BRIDGE_ERROR_CODES.internalError,
    });
  });

  test("maps error response to thrown BridgeError", async () => {
    const invoke = createPreloadInvoker(async (_channel, request) => ({
      ok: false as const,
      requestId: request.requestId,
      error: {
        code: BRIDGE_ERROR_CODES.unsupportedOperation,
        message: "unsupported",
      },
    }));

    await expect(invoke(BRIDGE_METHODS.runtimeGetInfo, {})).rejects.toMatchObject({
      code: BRIDGE_ERROR_CODES.unsupportedOperation,
      message: "unsupported",
    });
  });
});
