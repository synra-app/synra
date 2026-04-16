import { describe, expect, test, vi } from "vite-plus/test";
import { createBridgeHandlers } from "../../../src/bridge/main/handlers";
import { createMainDispatcher } from "../../../src/bridge/main/dispatch";
import { BRIDGE_ERROR_CODES } from "../../../src/shared/errors/codes";
import { BRIDGE_METHODS, BRIDGE_PROTOCOL_VERSION } from "../../../src/shared/protocol/constants";
import type { RuntimeInfo } from "../../../src/shared/protocol/types";

function createRuntimeInfo(): RuntimeInfo {
  return {
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    supportedProtocolVersions: [BRIDGE_PROTOCOL_VERSION],
    capacitorVersion: "8.0.0",
    electronVersion: "34.0.0",
    nodeVersion: process.versions.node,
    platform: process.platform,
    capabilities: ["runtime.getInfo"],
  };
}

function createHandlers() {
  return createBridgeHandlers({
    runtimeInfoService: { getRuntimeInfo: vi.fn(async () => createRuntimeInfo()) },
    externalLinkService: { openExternal: vi.fn(async () => ({ success: true as const })) },
    fileService: {
      readFile: vi.fn(async () => ({ content: "ok", encoding: "utf-8" as BufferEncoding })),
    },
    pluginRuntimeService: {
      register: vi.fn(),
      unregister: vi.fn(),
      listPlugins: vi.fn(() => []),
      resolveActions: vi.fn(async () => ({ candidates: [] })),
      executeSelected: vi.fn(async () => ({
        messages: [],
        receipt: {
          ok: true as const,
          actionId: "a1",
          handledBy: "test-plugin",
          durationMs: 1,
        },
      })),
    },
    pluginCatalogService: {
      getCatalog: vi.fn(async () => ({ plugins: [] })),
    },
  });
}

describe("bridge/main/dispatch", () => {
  test("returns runtime info for valid runtime.getInfo request", async () => {
    const dispatch = createMainDispatcher(createHandlers());

    const response = await dispatch({
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      requestId: "req-1",
      method: BRIDGE_METHODS.runtimeGetInfo,
      payload: {},
    });

    expect(response.ok).toBe(true);
    if (response.ok) {
      expect((response.data as RuntimeInfo).protocolVersion).toBe(BRIDGE_PROTOCOL_VERSION);
    }
  });

  test("rejects unsupported method with stable error code", async () => {
    const dispatch = createMainDispatcher(createHandlers());
    const response = await dispatch({
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      requestId: "req-2",
      method: "unknown.method",
      payload: {},
    });

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(BRIDGE_ERROR_CODES.unsupportedOperation);
    }
  });

  test("rejects invalid request shape", async () => {
    const dispatch = createMainDispatcher(createHandlers());
    const response = await dispatch(null);

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(BRIDGE_ERROR_CODES.invalidParams);
    }
  });

  test("returns timeout when handler exceeds timeout budget", async () => {
    const slowHandlers = createBridgeHandlers({
      runtimeInfoService: {
        getRuntimeInfo: vi.fn(
          async () =>
            new Promise<RuntimeInfo>((resolve) => {
              setTimeout(() => resolve(createRuntimeInfo()), 30);
            }),
        ),
      },
      externalLinkService: { openExternal: vi.fn(async () => ({ success: true as const })) },
      fileService: {
        readFile: vi.fn(async () => ({ content: "", encoding: "utf-8" as BufferEncoding })),
      },
      pluginRuntimeService: {
        register: vi.fn(),
        unregister: vi.fn(),
        listPlugins: vi.fn(() => []),
        resolveActions: vi.fn(async () => ({ candidates: [] })),
        executeSelected: vi.fn(async () => ({
          messages: [],
          receipt: {
            ok: true as const,
            actionId: "a1",
            handledBy: "test-plugin",
            durationMs: 1,
          },
        })),
      },
      pluginCatalogService: {
        getCatalog: vi.fn(async () => ({ plugins: [] })),
      },
    });
    const dispatch = createMainDispatcher(slowHandlers, { defaultTimeoutMs: 1 });
    const response = await dispatch({
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      requestId: "req-3",
      method: BRIDGE_METHODS.runtimeGetInfo,
      payload: {},
    });

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(BRIDGE_ERROR_CODES.timeout);
    }
  });
});
