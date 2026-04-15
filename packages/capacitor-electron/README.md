# @synra/capacitor-electron

`@synra/capacitor-electron` provides a typed bridge foundation for Capacitor + Electron integration.

This package follows a layered design:

- `api`: Promise-based typed plugin API.
- `bridge/preload`: single `invoke` entry for renderer to main IPC.
- `bridge/main`: method-dispatch gateway with error normalization and timeout guard.
- `host/services`: runtime, external link, and file capability services.
- `host/adapters`: Electron/Node adapters for shell and filesystem calls.
- `shared`: protocol types, error codes, validators, and observability contracts.

## Current capability set

- `runtime.getInfo`
- `external.open`
- `file.read`

## Protocol baseline

- Channel: `synra:cap-electron:v1:invoke`
- Protocol version: `1.0`
- Stable error codes: `INVALID_PARAMS`, `UNAUTHORIZED`, `NOT_FOUND`, `TIMEOUT`, `UNSUPPORTED_OPERATION`, `INTERNAL_ERROR`

## Quick usage

### Main process registration

```ts
import { setupBridgeMainRuntime } from "@synra/capacitor-electron";

setupBridgeMainRuntime(ipcMain, {
  allowedFileRoots: [process.cwd()],
});
```

### Preload bridge exposure

```ts
import { contextBridge, ipcRenderer } from "electron";
import { createPreloadInvoker, exposePreloadBridge } from "@synra/capacitor-electron";

const invoke = createPreloadInvoker((channel, request) => ipcRenderer.invoke(channel, request));
exposePreloadBridge(invoke);
```

### Renderer API usage

```ts
import { createElectronBridgePluginFromGlobal } from "@synra/capacitor-electron";

const plugin = createElectronBridgePluginFromGlobal();
const runtimeInfo = await plugin.getRuntimeInfo();
```

## Development

```bash
vp install
vp check
vp test
vp pack
```
