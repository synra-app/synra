import { describe, expect, test } from "vite-plus/test";
import {
  type BridgeInvoke,
  createElectronBridgePlugin,
  createElectronBridgePluginFromGlobal,
} from "../../src/api/plugin";
import { BRIDGE_ERROR_CODES } from "../../src/shared/errors/codes";
import { BRIDGE_METHODS, BRIDGE_PROTOCOL_VERSION } from "../../src/shared/protocol/constants";
import type { MethodResultMap } from "../../src/shared/protocol/types";

describe("api/plugin", () => {
  test("calls runtime.getInfo through invoke", async () => {
    const invoke: BridgeInvoke = async (method) => {
      expect(method).toBe(BRIDGE_METHODS.runtimeGetInfo);
      return {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        supportedProtocolVersions: [BRIDGE_PROTOCOL_VERSION],
        capacitorVersion: "8.0.0",
        electronVersion: "34.0.0",
        nodeVersion: process.versions.node,
        platform: process.platform,
        capabilities: ["runtime.getInfo"],
      } as MethodResultMap[typeof method];
    };
    const plugin = createElectronBridgePlugin(invoke);

    const runtimeInfo = await plugin.getRuntimeInfo();
    expect(runtimeInfo.protocolVersion).toBe(BRIDGE_PROTOCOL_VERSION);
  });

  test("validates openExternal input", async () => {
    const invoke: BridgeInvoke = async () => {
      throw new Error("invoke should not be called for invalid params");
    };
    const plugin = createElectronBridgePlugin(invoke);
    await expect(plugin.openExternal(null as never)).rejects.toMatchObject({
      code: BRIDGE_ERROR_CODES.invalidParams,
    });
  });

  test("throws when preload bridge is missing on global", async () => {
    expect(() => createElectronBridgePluginFromGlobal({})).toThrow(
      "Preload bridge is not available",
    );
  });
});
