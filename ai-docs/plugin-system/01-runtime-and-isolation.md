# 01 Runtime & Isolation（host 决定）

> v3 核心激进点（修订）：**Plugin 不再声明 isolation / runtime 之类的枚举**——这是 host 的内部决策。Plugin 一份代码，所有端跑出一样的效果。

## TL;DR

| 谁决定什么           | 详情                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| **Plugin 作者**      | 只写 npm 包代码 + `setup(context)`，不写任何 runtime 字段                                        |
| **Host**             | 决定跑在哪（main context / Web Worker / utilityProcess）；由 host 内部策略 + plugin 实际用法推断 |
| **Capability Proxy** | 每次 SDK 调用都校验；不管 host 跑在哪                                                            |

## 1. 为什么 plugin 不声明 runtime

v3 早期版本里我曾设计：

```ts
// 错的版本（已废弃）
definePlugin({
  id: '...',
  isolation: 'worker' // ← 这是错的
})
```

错了。原因：

- **Plugin 作者不是部署者**：插件作者不知道用户的 host 是 Electron 还是 web，是桌面还是手机；
- **Plugin 一份代码多处跑**：同一份 bundle 要在 web、Electron renderer、Capacitor WebView 都能跑；
- **隔离是优化，不是契约**：把"我要个 Worker"暴露给 plugin 等于把内部优化决策写死；
- **runtime 是不稳定的概念**：未来 host 可能改跑在 Service Worker / Wasm isolate / ShadowRealm 上，Plugin 不能因为 runtime 名字变了就崩。

正确做法：**plugin 一份代码 + host 自己决定跑在哪**。

## 2. Host 怎么决定

Host 维护一个内部 `RuntimeAllocator`：

```ts
// apps/web/src/plugins/runtime-allocator.ts
import type { PluginManifest } from '@synra/plugin-sdk'

export type Runtime =
  | { kind: 'main' } // 跟 host SPA 同一个 JS context
  | { kind: 'worker'; port: MessagePort } // Web Worker（浏览器 / Electron renderer）
  | { kind: 'process'; port: MessagePortMain } // utilityProcess（仅 Electron main）

export class RuntimeAllocator {
  /**
   * 决定 plugin 跑在哪。
   * 默认 main；如果存在不安全的 API 请求 / 注册了 timer 巨多 → worker；
   * 仅 Electron main 可用 process。
   */
  async allocate(plugin: PluginManifest, env: HostEnv): Promise<Runtime> {
    // 启发式：plugin 声明了 'fs:write' 或 'native:invoke' → 用 process（仅桌面）
    if (plugin.capabilities.some((c) => c.startsWith('fs:') || c.startsWith('native:'))) {
      if (env.supports.process)
        return { kind: 'process', port: await env.spawnUtilityProcess(plugin) }
    }

    // Plugin 暴露 "cpu-heavy" hint（可选，仅当 plugin 作者显式声明时）
    if (plugin.hints?.includes('cpu-heavy') && env.supports.worker) {
      return { kind: 'worker', port: await env.spawnWorker(plugin) }
    }

    // 默认 main
    return { kind: 'main' }
  }
}
```

`plugin.hints` 是**可选**的、由 plugin 作者提供、不影响 plugin 行为——host 选择是否使用：

```jsonc
{
  "synra": {
    "id": "...",
    "capabilities": [...],
    "hints": ["ui-heavy", "cpu-heavy", "io-heavy"]   // 可选，仅作决策参考
  }
}
```

但 host 不强制：plugin 不写 hints 也能用 main context 默认跑。

## 3. 不写 runtime 的好处

### 3.1 Plugin 一份代码，多端跑

```ts
// 同一份 src/index.ts
export default definePlugin({
  async setup(ctx) {
    // 不关心 runtime；ctx 永远是 SDK 表面
    ctx.device.send(...)
    ctx.fs.write(...)         // 桌面端：由 process runtime 满足
    ctx.fs.write(...)         // 移动端：自动降级到 Capacitor Filesystem（不真用 Node fs）
  },
})
```

### 3.2 移动端 = 桌面端

```text
桌面（Electron renderer）                 移动（Capacitor WebView）
  host SPA (main context)                    host SPA (main context)
  plugin: main context                       plugin: main context
  fs.write: utilityProcess Node fs           fs.write: Capacitor Filesystem
       ↑                                          ↑
       SDK 在 host 侧选的实现不同                 SDK 在 host 侧选的实现不同
       ↓                                          ↓
       都是同一个 ctx.fs.write() API               都是同一个 ctx.fs.write() API
```

Plugin 在两边写 `ctx.fs.write(...)`——内核是 host 在背后挑的。

### 3.3 调试简单

Plugin 写到桌面时，直接在 Chrome DevTools 同 SPA 一起 debug（main context）。不需要"打开子 Worker"的步骤。

## 4. createSynraSDK 在 host 内部怎么选 bridge

Host 根据分配的 Runtime 选对应 bridge：

```ts
// apps/web/src/plugins/host-bridge.ts
export function createBridgeFor(runtime: Runtime, registry: PluginRegistry): Bridge {
  switch (runtime.kind) {
    case 'main':
      return createMainBridge(registry) // in-process
    case 'worker':
      return createWorkerBridge(runtime.port) // MessageChannel
    case 'process':
      return createProcessBridge(runtime.port) // MessagePortMain
  }
}
```

```ts
// apps/web/src/plugins/loader.ts
export async function enablePlugin(manifest: PluginManifest, registry: PluginRegistry) {
  const module = await loadBundle(manifest.main)

  // ① host 决定 runtime
  const runtime = await runtimeAllocator.allocate(manifest, hostEnv)

  // ② host 决定 bridge
  const bridge = createBridgeFor(runtime, registry)

  // ③ host 调 SDK 工厂
  const sdk = createSynraSDK({
    pluginId: manifest.id,
    capabilities: manifest.capabilities,
    bridge,
    registry
  })

  // ④ plugin 的 setup 跑
  try {
    const teardown = await module.default.setup(sdk)
    return { ...runtime, teardown: teardown ?? defaultTeardown(sdk) }
  } catch (e) {
    throw new PluginSetupError(manifest.id, e)
  }
}
```

Plugin 拿到的 `sdk` 不知道自己是 main / worker / process——它在能力许可下做该做的事。

## 5. 移动端的具体行为

移动 WebView（Capacitor / WKWebView）默认跑 main context：

- `fs:write` Capability 调用 → SDK 内部走 Capacitor `Filesystem` 插件；
- `device:send` → 走 Capacitor `DeviceConnection` 插件；
- Worker 在 iOS 后台会被挂起，所以即便 host 想升级到 worker，也要先判宿主 state 后再决定。

```ts
export async function allocate(plugin, env) {
  if (env.kind === 'mobile-webview') {
    // 移动端只考虑 main + worker
    if (plugin.hints?.includes('cpu-heavy')) {
      try {
        return { kind: 'worker', port: await env.spawnWorker(plugin) }
      } catch {
        // iOS 后台挂起风险，fallback 到 main
        return { kind: 'main' }
      }
    }
    return { kind: 'main' }
  }

  // ... web / Electron 其它分支
}
```

## 6. 端能力的探测

Host 在启动时枚举自身能力：

```ts
interface HostEnv {
  readonly kind: 'web' | 'electron-renderer' | 'electron-main' | 'mobile-webview'
  readonly supports: {
    worker: boolean // Worker 全局可用
    process: boolean // 仅 electron-main
    nativeBridge: boolean // Capacitor / Electron IPC
    fs: 'node' | 'capacitor' | 'browser' | null
  }
  spawnWorker(plugin): Promise<MessagePort>
  spawnUtilityProcess(plugin): Promise<MessagePortMain>
}
```

`RuntimeAllocator.allocate(plugin, env)` 据此决策。

## 7. 默认与策略

Host 全局配置（Settings → Plugins → Advanced）：

```jsonc
{
  "runtimeStrategy": "auto", // auto | main-only | prefer-worker
  "maxWorkers": 4, // Worker 池上限
  "processAllowed": true, // 是否允许 utilityProcess
  "mobileFallback": "main", // mobile worker 失败时 fallback
  "autoSync": true // 多端自动同步（默认 true）
}
```

"auto"（默认）：

- Plugin 用了 fs / native → process（仅 Electron）
- Plugin 写了 `hints: ['cpu-heavy']` → worker
- 否则 main

"main-only"：强制 main，host 把 plugin 强制在同进程跑，调试方便。

"prefer-worker"：能用 worker 就 worker（mobile 平台除外）。

## 8. Plugin 元数据中**没有**的字段

明确禁止 plugin 在元数据里写：

| ❌ 字段               | 原因         |
| --------------------- | ------------ |
| `isolation`           | host 决定    |
| `runtime: 'main'      | 'worker'     | 'process'             | 'web'` | host 决定 |
| `kind: 'desktop'      | 'mobile'     | 'headless'`           | 同上   |
| `target: 'web'        | 'mobile'`    | plugin 不该指定在哪跑 |
| `platform: 'electron' | 'capacitor'` | 同上                  |

Plugin 元数据只声明：

- `id / version / title / description`
- `capabilities`（能做什么）
- `events.publish / subscribe`（订阅 / 发布的事件）
- `network.outbound`（网络白名单）
- `minSdkVersion / preferredSdkVersion`
- `hints: string[]`（**可选**软提示，host 可忽略）

## 9. 与 v2 对比

| 维度             | v2                                                                | v3                               |
| ---------------- | ----------------------------------------------------------------- | -------------------------------- |
| Plugin 元数据    | `entries.{ui,host}` / `permissions.events.*` / `network.outbound` | 同等字段，无 isolation / runtime |
| Runtime 决策方   | plugin 声明（4 个枚举）                                           | **host 决定**                    |
| 移动端 vs 桌面端 | 双 runtime                                                        | 同 runtime（不同实现）           |
| 调试入口         | iframe / Worker 单独 DevTools                                     | 同 main context，直接调试        |
| 跨端测试         | 4 套                                                              | 1 套                             |

## 10. 未来 runtime 选项（host-only）

下面这些都**只**是 host 内部决策，对 plugin 不可见：

| Runtime                   | 何时用                           | 何时禁用       |
| ------------------------- | -------------------------------- | -------------- |
| main                      | 99% 场景                         | —              |
| Web Worker                | plugin 标 `cpu-heavy` 或计算密集 | iOS 后台挂起时 |
| Electron utilityProcess   | plugin 用 fs / Node API          | 仅 desktop     |
| ShadowRealm（标准成熟后） | 同 main，但隔离 JS context       | 浏览器支持差   |
| Wasm isolate（未来）      | 不可信三方 plugin                | 编译开销大     |

Plugin 一份代码在所有这些 runtime 上都跑同一份 bundle——host 选哪个都行。

## 11. 总结

> "plugin 写代码、host 挑 runtime" 是 v3 的关键认知。
>
> v2 让 plugin 写 kind / runtime（让 plugin 自己决定跑在哪）— 错。
> v3 让 host 自己挑，并保留 plugin 写 hints 的"软建议"能力。
>
> Plugin 作者从未需要看 `runtime` 这个字。

下一节：[02-capability-gate.md](./02-capability-gate.md) — Capability Proxy 是 plugin 与 host 之间真正的边界。
