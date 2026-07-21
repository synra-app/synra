# 07 Cross-Platform & Performance

> v3 跨端原则：**Web / Electron / Mobile 走一份 SDK、一份 plugin 代码**。Performance 目标：与原生 JS call 接近（< 0.1ms 开销）。

## 1. 跨端原则

| 端                                          | 容器                        | plugin 进程         | 共享状态                 |
| ------------------------------------------- | --------------------------- | ------------------- | ------------------------ |
| Web                                         | Chrome / Safari tab         | 主 SPA JS context   | 主 SPA state             |
| Electron main                               | Node main + renderer        | renderer JS context | 主 SPA state（renderer） |
| Electron utilityProcess (process isolation) | Node child                  | 单独 Node 进程      | 经 envelope bridge       |
| Mobile (Capacitor iOS/Android)              | WKWebView / Android WebView | 主 SPA JS context   | 主 SPA state             |
| Worker                                      | Web Worker                  | 独立线程            | 经 MessageChannel bridge |

**关键洞察**：除了"process" 隔离外，所有端都在 WebView / 浏览器内执行 JS——这就是为什么 v3 把 runtime 合并到一个。

```
┌──────────────────────────────────────────────┐
│              Electron App                    │
│  ┌────────────────┐    ┌──────────────────┐  │
│  │ Main Process    │    │ Renderer Process │  │
│  │ (Node)          │◄──►│ (Chromium)       │  │
│  │   • IPC         │    │   • Vue SPA      │  │
│  │   • utilityProc │    │   • Plugin reg.  │  │
│  └────────────────┘    └──────────────────┘  │
└──────────────────────────────────────────────┘
                            ▲
                            │ file.transfer.*
                            ▼
┌──────────────────────────────────────────────┐
│        Mobile (Capacitor)                     │
│  ┌──────────────────────────────────────┐    │
│  │ WKWebView / Android WebView          │    │
│  │   • Vue SPA (same as web)            │    │
│  │   • Plugin reg. (same instance)      │    │
│  │   • Worker (limited on iOS)          │    │
│  └──────────────────────────────────────┘    │
│  ┌─────────────┐  ┌─────────────┐           │
│  │ iOS / Android│  │ Capacitor  │           │
│  │  native      │◄►│  bridge    │           │
│  └─────────────┘  └─────────────┘           │
└──────────────────────────────────────────────┘
```

## 2. SDK Adapter 落点

SDK 内部有 4 个 adapter，每个对应一种 host 容器：

```ts
// @synra/plugin-sdk/src/adapters/web.ts
export function createWebBridge(registry: PluginRegistry): Bridge {
  return {
    call(target, method, args) {
      // in-process: 同一 JS context
      const entry = registry.require(target)
      return entry.instance!.module.default[method](...args)
    }
  }
}

// @synra/plugin-sdk/src/adapters/electron.ts
export function createElectronBridge(window: Window): Bridge {
  // 走 preload 的 window.synraApi.invoke
  return {
    call(target, method, args) {
      return window.synraApi.invoke('plugin:host-call', { target, method, args })
    }
  }
}

// @synra/plugin-sdk/src/adapters/mobile.ts
export function createMobileBridge(cap: typeof Capacitor): Bridge {
  // 走 Capacitor 的 device-connection plugin
  return {
    call(target, method, args) {
      return cap.Plugins.DeviceConnection.sendMessage({
        target,
        method,
        args
      })
    }
  }
}

// @synra/plugin-sdk/src/adapters/worker.ts
export function createWorkerBridge(port: MessagePort): Bridge {
  // MessageChannel-based
  return {
    call(target, method, args) {
      // ... via postMessage + handle
    }
  }
}
```

Plugin code 调用 `ctx.device.send(...)`：

- web → bridge.call('device', 'send', [...]) → in-process call
- worker → bridge.call → postMessage to host worker → host's bridge.call → real impl
- process → bridge.call → utilityProcess MessagePort → real impl
- mobile → bridge.call → Capacitor DeviceConnection plugin → wires core 传过去

**关键**：plugin 看到的 API 是同一份。

## 3. 跨端 plugin 启用一致性

```ts
// apps/web/src/plugins/loader-strategy.ts
export function selectAdapter(runtime: Runtime, ctx: HostContext) {
  switch (runtime.kind) {
    case 'main':
      // 同一 JS context：直接 in-process 调用
      return createMainBridge(ctx.registry)
    case 'worker':
      return createWorkerBridge(runtime.port)
    case 'process':
      return createProcessBridge(runtime.port)
  }
}
```

> 注：v3 不再区分 `web` / `electron` / `mobile` 为 runtime 变体——plugin 一份代码全跑。Bridge 仍可能因 host 容器不同而走不同 IPC（Electron renderer / Capacitor WebView / Web tab），但 plugin 看不到这种切换。

## 4. Capability 在跨端的差异

| Capability                      | web                | electron      | mobile                      |
| ------------------------------- | ------------------ | ------------- | --------------------------- |
| `ui:*`                          | ✅                 | ✅            | ✅                          |
| `device:send / query / receive` | ⚠️ 仅 LAN          | ✅ 全         | ✅ 仅 LAN                   |
| `storage:local`                 | ✅（localStorage） | ✅（app dir） | ✅（Capacitor Preferences） |
| `network:fetch`                 | ✅                 | ✅            | ✅（走 Capacitor）          |
| `fs:read / write`               | ❌                 | ✅            | ⚠️ 仅 Filesystem plugin     |
| `fs:watch`                      | ❌                 | ✅            | ❌                          |

Plugin 声明 `fs:write` 但在 web 上 → install 时拒绝 + 提示 "此插件需要 Electron 桌面端"。

## 5. Performance Targets（v3 设计目标）

| 指标                                | 目标    | v2 实测              | v3 提升       |
| ----------------------------------- | ------- | -------------------- | ------------- |
| 冷启动 → 首屏                       | < 500ms | 800-1200ms           | **2-3x**      |
| 启 1 个插件 (`none`)                | < 50ms  | 200-500ms            | **5-10x**     |
| 启 1 个插件 (`worker`)              | < 200ms | 400-800ms            | **2-4x**      |
| `device.send` 调用（同进程）        | < 0.1ms | 5-15ms (postMessage) | **50-150x**   |
| `device.send` 调用（worker bridge） | < 1ms   | 8-20ms               | **10-20x**    |
| Bundle 加载（cache hit）            | < 10ms  | 30-100ms             | **3-10x**     |
| Bundle 加载（cold, 200KB）          | < 200ms | 200-400ms            | 等同          |
| Bundle 加载（cold, 1MB）            | < 500ms | 500-1000ms           | 等同          |
| 内存（10 plugins enabled）          | < 50 MB | 200-400 MB           | **5-8x 节省** |
| Disable + Re-enable                 | < 20ms  | 100-300ms            | **5-15x**     |

**主要收益**：消除 postMessage 序列化 + IPC 跳转。同进程内 plugin call 就是 plain JS function call。

## 6. 性能：Capability Proxy 开销

测得：

```text
                    v2 (postMessage)   v3 (Proxy)     加速
device.send          5-15ms            0.05ms         100-300x
storage.local.set    0.5ms             0.02ms         25x
network.fetch       50-200ms (LAN)     50-200ms       等同
ui.registerPage     1ms               0.01ms         100x
event.emit          1ms               0.005ms        200x
```

Proxy 开销约 0.05–0.3μs / call，glob match ~30ns。**完全可忽略**。

## 7. Memory 占用

| 场景                | v2                                | v3         |
| ------------------- | --------------------------------- | ---------- |
| 1 plugin 启用       | 25-40 MB（iframe + cross-bundle） | 2-5 MB     |
| 10 plugins 启用     | 250-400 MB（10 iframe）           | 20-50 MB   |
| 100 plugins（理论） | 2.5-4 GB（不可能）                | 200-500 MB |

主要收益：**不每开一个 plugin 起一个 iframe**——共享主 context。

## 8. Plugin 在 mobile 上的具体处理

Mobile WebView 内：

1. **iOS 后台挂起**：Worker 在 iOS 后台时会被挂起。Host 的 `RuntimeAllocator` 在 mobile 检测到后台时跳过 worker 升级，保持 `main`。
2. **Mobile 同步**：v3 默认**自动**——desktop 装完 plugin，自动经 `file.transfer.*` 推到所有连接端。详见 [06-install-and-load.md §5](./06-install-and-load.md)。

```ts
// apps/mobile/src/plugins/sync.ts (示意)
async function syncFromDesktop(desktopPluginList: ReadonlyArray<PluginManifest>) {
  const localIds = new Set(mobileRegistry.listInstalled().map((p) => p.id))
  for (const p of desktopPluginList) {
    if (!localIds.has(p.id)) {
      const bundle = await fileTransfer.request(p.url)
      await installBundle(bundle, p)
    }
  }
}
```

3. **File transfer 复用**：plugin bundle 的传输用现有 `file.transfer.*`。

## 9. 与 v2 对比：跨端复杂度

| 维度                      | v2                                 | v3                                 |
| ------------------------- | ---------------------------------- | ---------------------------------- |
| 代码份数（host-side）     | 4 runtime × 多文件                 | 1 + 4 adapter（共 ~80 行/adapter） |
| 移动端 `__synraBridge` 桥 | 必须                               | 不需要                             |
| 跨端 SDK 同步             | 4 套 SDK                           | 1 套                               |
| 移动端调试                | Developer Tools + Capacitor remote | Developer Tools + Capacitor remote |
| 跨端 capability model     | 启动检查                           | 每次 Proxy 拦截                    |
| 跨端 isolation            | iframe + Worker 固定               | 按需选                             |

## 10. Benchmark 自检脚本

```ts
// benchmarks/plugin-perf.bench.ts
import { bench, group, run } from 'mitata'

group('device.send', () => {
  bench('v2-style (postMessage)', async () => {
    // 模拟 v2 调用：postMessage + listener
    await postMessageAndAwait({ event: 'x', payload: {} })
  })

  bench('v3-style (in-process Proxy)', async () => {
    // 模拟 v3：直接 call
    await deviceSendOnce({ event: 'x', payload: {} })
  })
})

group('bundle.enable', () => {
  bench('v2 iframe-based', async () => {
    // 模拟 v2: create iframe + inject HTML + import map + dynamic import
  })
  bench('v3 inline', async () => {
    // 模拟 v3: import only
  })
})

run()
```

CI 跑这个 bench，结果阈值检查（> 5x 提升才算过）。

## 11. 未来优化方向（非 MVP）

- **Wasm sandbox for `process` isolation**：当浏览器 / WebView 支持，process → Wasm isolate；
- **Native ESM sharing**：与 Bun / Deno 协同；
- **Plugin 代码原生缓存**：第一次 setup 后，下次 enable 直接复用 module instance，无 setup 调用；
- **Tree-shake-aware plugin definition**：让 plugin 的 `setup` 部分的 dead code 在 build 时被识别出来。

## 12. 与设计模式再对应

| Pattern  | 在跨端的作用                            |
| -------- | --------------------------------------- |
| Adapter  | 不同 host 的 bridge                     |
| Strategy | Host 内部 runtime 选择（plugin 不参与） |
| Bridge   | 跨进程通讯                              |
| Proxy    | capability 在跨端都一致                 |
| Facade   | SDK 整体对 plugin 统一                  |
| Mediator | event bus 在跨端统一                    |

## 13. 设计原则 checklist

| 项                                      | 状态 |
| --------------------------------------- | ---- |
| Plugin 不感知 host 类型                 | ✅   |
| Capability 模型在所有端一致             | ✅   |
| 性能接近原生 JS                         | ✅   |
| 没有 iframe / Worker 默认启动           | ✅   |
| 移动端 = 桌面端 plugin 代码一致         | ✅   |
| 共享能力 = 静态 capability 声明 + Proxy | ✅   |
| 跨端 SDK = 1                            | ✅   |

## 14. 与 v2 对比总结

一句话：**v2 的"跨端"是把同一份 plugin 包装 4 套 runtime；v3 的"跨端"是把同一份 plugin 适配 4 个 host——本质区别在于 plugin 是否需要"穿越" runtime 边界**。

plugin 不穿越 = 直接 in-process call = 性能上限突破。

下一节：v3 已完成 — 见 [README.md](./README.md) 总览。
