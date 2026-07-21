# 00 Plugin Runtime Model（v3 半成品收敛 → 当前权威）

> 激进重写，**不保留 v2/v3 早期 API 兼容**。最终目的：软件在任何宿主上都能正确跑插件；插件作者用一句 `import` 就能拿到全部能力，不必关心宿主差异。

---

## 0. 一句话总结

**`@synra/plugin-sdk` 退化成 types-only 包；plugin bundle 零运行时外部依赖；host 通过 `provide(SYNRA_BRIDGE_KEY, bridge)` 把一个 closure-based `PluginBridge` 注入插件的 Vue 组件树；`PluginBridge` 内部 closure 绑定 host 内部的单例状态。**

---

## 1. 当前半成品的事实清单

### 1.1 文档与代码脱节

| 文档承诺                                                    | 实际代码状态                                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| `external: ['@synra/plugin-sdk']` —— host 在运行时提供      | host 既没在 web 注入 importmap，也没把 SDK 作为单独 ESM 暴露               |
| plugin 用 `import { SynraPlugin } from '@synra/plugin-sdk'` | Electron dev 由 Vite dev server 强解，prod 直接 break                      |
| `usePairedDevices` 等 composable 共享 host 单例             | 当前只在 dev 模式偶然生效（host 和 plugin 都解析到 workspace 同一份源码）  |
| `onPluginEnter` / `onPluginExit` 生命周期                   | host 当前用 `createNoopPlugin()`，**从未真正实例化 plugin 的 `Plugin` 类** |

### 1.2 实际触发崩溃的现场

**Android WebView 上点击 Open 插件**：

```
File:  - Line 349 - Msg: [object Object]
  uri: file:///data/user/0/com.synra.app/files/synra/plugins/chat/1.0.0/package/dist/synra/index.js
TypeError: Failed to fetch dynamically imported module
  ...dist/ui/synra/index.js
```

两个 bug：

1. `plugin-route-binder.ts#resolvePageModuleCandidates` 给 v3 路径生成了 v2 `dist/ui/` 兜底（已修）
2. v3 bundle 里 `import { SynraPlugin } from "@synra/plugin-sdk"` —— Android WebView 没有 importmap，bare specifier 无法解析

### 1.3 半成品的根因

v3 设计假设了一组**module-singleton 状态**：

```ts
// packages/hooks/src/runtime/paired-devices-storage-epoch.ts
export const pairedDevicesStorageEpoch = ref(0)

// packages/hooks/src/runtime/core.ts
let runtimeSingleton: ConnectionRuntime | null = null
export function getConnectionRuntime(): ConnectionRuntime { ... }
```

这套设计**前提是 host 和 plugin 加载同一份 module 实例**。Electron dev 模式靠 Vite 共享 workspace 源码恰好满足，prod 模式从来没有满足过——文档里画的"host 提供 SDK"的图，host 端没实现。

---

## 2. 设计目标

| 目标                     | 度量                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| 软件在任何宿主都能跑插件 | Android / iOS WebView、Electron renderer、纯 web 表现一致                                         |
| 插件作者 API 优雅        | 不出现 `window.x.y()`、不出现 `props.sdk.foo()` 套娃；最自然的写法就是 `inject(SYNRA_BRIDGE_KEY)` |
| State 共享零分歧         | host 单例状态自动同步到 plugin，不依赖 module singleton                                           |
| Bundle 体积小            | plugin bundle 不重复打包 host 已经有的运行时                                                      |
| 类型安全                 | plugin 作者 IDE 里能看到完整类型签名、自动补全                                                    |
| 激进重写                 | 不考虑 v2/v3 早期 plugin 的兼容（用户已确认）                                                     |

---

## 3. 新架构

### 3.1 一张图

```
                  ┌──────────────────────────┐
                  │   @synra/plugin-sdk      │   ← types-only
                  │   - SynraPlugin (class)  │     （import type 编译后归零）
                  │   - PluginBridge (type)  │
                  │   - SYNRA_BRIDGE_KEY     │
                  │   - PairedLinkStatus etc │
                  └──────────────────────────┘
                              ▲
                              │ import type
                              │
┌────────────────────────────┴────────────────────────────┐
│              Plugin Bundle (dist/synra/index.js)        │
│                                                        │
│  - Vue components (inlined)                            │
│  - Vue runtime (inlined)                               │
│  - Plugin lifecycle class (inlined, optional)          │
│  - composables that take bridge as parameter           │
│                                                        │
│  ZERO bare specifiers in JS output                     │
└────────────────────────────┬────────────────────────────┘
                             │
                             │ dynamic import() at runtime
                             ▼
┌────────────────────────────────────────────────────────┐
│   Host SPA (apps/frontend)                             │
│                                                        │
│   createPluginBridge({                                 │
│     pluginId, capabilities, hostEnv                     │
│   }) → PluginBridge                                    │
│                                                        │
│   provide(SYNRA_BRIDGE_KEY, bridge) at route boundary  │
│                                                        │
│   PluginBridge.usePairedDevices()  ── closure ──┐      │
│   PluginBridge.send(...)  ─────── closure ─────┐│      │
│                                                ▼▼      │
│   ┌─────────────────────────────────────────────────┐   │
│   │ host singletons (already exist):                │   │
│   │   pairedDevicesStorageEpoch ref                │   │
│   │   getConnectionRuntime() instance              │   │
│   │   device.send, network.fetch, ...              │   │
│   └─────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────┘
```

### 3.2 关键概念

- **`PluginBridge`**：一个普通 JS 对象，**纯 closure**，不依赖 module singleton。host 在 `enablePlugin` 时调 `createPluginBridge()` 创建一个。
- **`SYNRA_BRIDGE_KEY`**：一个 `Symbol` 常量，从 `@synra/plugin-sdk` 导出。Vue 的 `provide`/`inject` 用它定位 bridge。
- **Plugin bundle**：除了 Vue 自身被打进去，**不再有运行时外部依赖**。`@synra/plugin-sdk` 的 import 全部是 `import type`，编译产物里是 0 字节。
- **State 共享**：通过 closure 自动实现。host 单例状态被 bridge 的闭包捕获，plugin 通过 `bridge.usePairedDevices()` 永远拿到同一个 ref。

### 3.3 Bundle 输出契约

```text
@synra-plugin/<id>/
├── package.json
├── src/
│   ├── index.ts                       # exports Plugin class (optional) + Vue root
│   ├── lib/
│   └── types/
├── pages/                             # 一 pageKey 一 SFC
│   └── home/index.vue
├── icons/
└── dist/
    └── synra/
        └── index.js                   # ★ 唯一产物；零 bare specifier；只依赖 vue（inlined）
```

`dist/synra/index.js` 的 import 形如：

```js
// 编译前
import { defineComponent, h, inject } from 'vue'
import type { PluginBridge, SYNRA_BRIDGE_KEY } from '@synra/plugin-sdk'  // import type → 0 字节
import HomePage from '../pages/home/index.vue'

// 编译后（全部 inlined，只有 Vue runtime + 插件代码）
```

---

## 4. `@synra/plugin-sdk` 新形态

### 4.1 文件结构

```text
packages/plugin-sdk/
├── src/
│   ├── index.ts                  # 重写：types + 抽象类 + key + 工厂
│   ├── plugin-bridge.ts          # 新增：PluginBridge type + createPluginBridge 工厂
│   ├── page-path.ts              # 不变
│   └── vite/index.ts             # 简化：移除 neverBundle 默认值
├── vite.config.ts
└── tests/
```

### 4.2 公开 API（types-only）

```ts
// packages/plugin-sdk/src/index.ts

// ── 1. 抽象类（plugin 作者用来挂生命周期钩子，纯类，零状态）──
export abstract class SynraPlugin {
  onPluginEnter(): void | Promise<void> {}
  onPluginExit(): void | Promise<void> {}
}

// ── 2. 类型 only 的辅助类型 ────────────────────────
export type PluginBridge = {
  readonly pluginId: string
  readonly capabilities: ReadonlyArray<string>

  // host singleton state via closure
  usePairedDevices(): {
    pairedDevices: ComputedRef<ReadonlyArray<PairedDeviceRow>>
    reloadPairedRecords(): Promise<void>
  }
  useSynraPluginEnvelope(): {
    send<T>(req: PluginSendRequest<T>): Promise<void>
    subscribe(handler: (msg: PluginInboundMessage) => void, opts?: SubscribeOptions): () => void
  }

  // 直接能力调用（host 内部做 capability gating）
  send<T>(target: string, event: string, payload: T): Promise<void>
  broadcast<T>(event: string, payload: T): Promise<void>
  fetch(input: string | URL, init?: RequestInit): Promise<Response>
  readFile(path: string): Promise<string>
  // ... 按需扩展
}

// ── 3. Vue provide/inject key ─────────────────────
export const SYNRA_BRIDGE_KEY: unique symbol = Symbol.for('synra.plugin.bridge')

// ── 4. 类型别名（plugin 作者写 props 时用）──────────────
export type { PairedLinkStatus, PairedDeviceRow, PluginSendRequest, PluginInboundMessage }
```

### 4.3 `createPluginBridge` 工厂（host 用）

**位置**：`packages/plugin-sdk/src/plugin-bridge.ts`

```ts
// ── 仅 host 内部使用；plugin 不直接调 ──
import { getConnectionRuntime, pairedDevicesStorageEpoch } from '@synra/hooks'

export function createPluginBridge(options: {
  pluginId: string
  capabilities: ReadonlyArray<string>
  hostEnv: HostEnv
}): PluginBridge {
  // closure 捕获 host 单例
  const runtime = getConnectionRuntime()
  const pluginId = options.pluginId

  function usePairedDevices() {
    const peers = computed(() => [...runtime.devices.value])
    const openTransportLinks = computed(() => [...runtime.openTransportLinks.value])
    const pairedRecords = ref<SynraPairedDeviceRecord[]>([])

    async function reloadPairedRecords() {
      const raw = await SynraPreferences.get({ key: SYNRA_PAIRED_DEVICES_KEY })
      pairedRecords.value = parsePairedDevicesPayload(raw.value).items
    }

    onMounted(() => {
      void runtime
        .ensureListeners()
        .then(() => reloadPairedRecords())
        .catch(() => undefined)
    })

    watch(pairedDevicesStorageEpoch, () => void reloadPairedRecords())

    const pairedDevices = computed<PairedDeviceRow[]>(() => {
      /* ... */
    })
    return { pairedDevices, reloadPairedRecords }
  }

  function useSynraPluginEnvelope() {
    // 内部用 runtime.outbound / runtime.inbound + pluginId 过滤
    // ...
  }

  async function send<T>(target: string, event: string, payload: T) {
    // capability gating then delegate to runtime
    if (!hasCapability(options.capabilities, `device:send:${target}`)) {
      throw new CapabilityDeniedError(pluginId, `device:send:${target}`, options.capabilities)
    }
    return runtime.send({ from: pluginId, to: target, event, payload })
  }

  // ... 其他方法

  return {
    pluginId,
    capabilities: options.capabilities,
    usePairedDevices,
    useSynraPluginEnvelope,
    send,
    broadcast,
    fetch,
    readFile
  }
}
```

`@synra/plugin-sdk` 仍然依赖 `@synra/hooks`（拿到 `getConnectionRuntime`、`pairedDevicesStorageEpoch`）。但这个依赖只在 host 侧——plugin bundle 看不到。

### 4.4 `defineConfig`（v3 plugin SDK vite helper）

```ts
// packages/plugin-sdk/src/vite/index.ts (新版本)
// 唯一变化：DEFAULT_NEVER_BUNDLE = []（默认全 inline）
// 移除所有 "@synra/plugin-sdk" 的 external 默认值

const DEFAULT_NEVER_BUNDLE: ExternalOption = [] // ← 改这里
const DEFAULT_ALWAYS_BUNDLE: ExternalOption = [/.*/]
```

plugin bundle 现在是**完全自包含**的，不留任何 bare specifier。

---

## 5. Host 端改动

### 5.1 `plugin-route-binder.ts` 改造

现状：lazy `import()` plugin bundle → 直接用 `default` export 作为 route component。

新形态：lazy `import()` → 拿到 `default` export → 用 wrapper 组件 `provide(SYNRA_BRIDGE_KEY, bridge)` 再渲染 default。

```ts
private resolvePageLoader(pluginId, artifactRoot, pageFilePath) {
  return async () => {
    const mod = await import(/* @vite-ignore */ toPluginAssetUrl(pluginId, 'dist/synra/index.js'))

    const bridge = createPluginBridge({
      pluginId,
      capabilities: this.capabilitiesByPluginId.get(pluginId) ?? [],
      hostEnv: this.hostEnv
    })

    const PluginRoot = mod.default
    return {
      default: defineComponent({
        name: `SynraPluginHost_${pluginId}`,
        setup() {
          provide(SYNRA_BRIDGE_KEY, bridge)
          return () => h(PluginRoot)
        }
      })
    }
  }
}
```

### 5.2 `plugin-lifecycle-manager.ts` 改造

现状：实例化一个 noop plugin，调空 `onPluginEnter/onPluginExit`。

新形态：

- `enablePlugin(pluginId)` 时创建 `PluginBridge`，存入 `bridgesByPluginId` Map
- `disablePlugin(pluginId)` 时 `bridge.dispose()`（如果有）
- 路由注册时把 bridge 传给 route binder

```ts
export class PluginLifecycleManager {
  private readonly bridgesByPluginId = new Map<string, PluginBridge>()

  async activate(router: Router, pluginId: string): Promise<void> {
    const capabilities = this.metadataByPluginId.get(pluginId)?.capabilities ?? []
    const bridge = createPluginBridge({
      pluginId,
      capabilities,
      hostEnv: this.hostEnv
    })
    this.bridgesByPluginId.set(pluginId, bridge)
    this.routeBinder.setBridge(pluginId, bridge)

    await this.routeBinder.attachRoutes(router, pluginId, artifactRoot, defaultPage)
  }

  async deactivate(router: Router, pluginId: string): Promise<void> {
    this.routeBinder.detachRoutes(router, pluginId)
    this.bridgesByPluginId.delete(pluginId)
  }
}
```

### 5.3 `plugin-host-facade.ts`

- 删除 `createNoopPlugin()`（不再需要）
- 把 `hostEnv` 注入到 lifecycle manager（discovery 状态、capability 表、electron/capacitor adapter）

### 5.4 删掉的代码

- `apps/frontend/vite.config.ts` 里的 `synraInstalledPluginWorkspaceResolve` ——不再需要，plugin bundle 已经自包含
- `apps/frontend/src/plugins/host/plugin-lifecycle-manager.ts` 里的 noop plugin 路径
- `apps/frontend/src/plugins/host/plugin-host-facade.ts#createNoopPlugin`

---

## 6. Chat Plugin 改造示例

### 6.1 `src/index.ts`（重写）

```ts
import { defineComponent, h } from 'vue'
import { SynraPlugin } from '@synra/plugin-sdk' // 仅 class；compiled 进 bundle
import HomePage from '../pages/home/index.vue'

/**
 * Lifecycle class. Host currently no-ops onPluginEnter/onPluginExit
 * (state sharing happens via PluginBridge, not lifecycle hooks),
 * but reserved for future use (e.g., background scans).
 */
export class Plugin extends SynraPlugin {
  // Empty for now; reserved.
}

/**
 * Vue root component. Host wraps it with a provide(SYNRA_BRIDGE_KEY, bridge)
 * before mounting, so this component (and any nested child) can:
 *   const bridge = inject(SYNRA_BRIDGE_KEY)
 */
export default defineComponent({
  name: 'ChatPluginRoot',
  setup() {
    return () => h(HomePage)
  }
})
```

### 6.2 `src/lib/composables/useMessagesPage.ts`（重写）

```ts
import { computed, ref, watch } from 'vue'
import type { PluginBridge } from '@synra/plugin-sdk'
import type { ChatMessage } from '../../types/chat'
import { CHAT_TEXT_EVENT, DEFAULT_CHANNEL } from '../events'
import { linkStatusDisplay } from '../strategies/link-status'
import { /* ... */ } from '../chat-store'

export function useMessagesPage(bridge: PluginBridge) {
  // ← 从 bridge 拿，单例状态自动共享（host 闭包）
  const { pairedDevices, reloadPairedRecords } = bridge.usePairedDevices()
  const envelope = bridge.useSynraPluginEnvelope()

  const selectedDeviceId = ref<string>('')
  const messageInput = ref('')
  const sending = ref(false)
  const sendError = ref<string | null>(null)

  const devices = computed(() => /* ... */)

  async function onSendMessage() {
    /* ... */
    await bridge.send(selectedDevice.value.deviceId, CHAT_TEXT_EVENT, {
      channel: DEFAULT_CHANNEL,
      body: messageInput.value.trim()
    })
    /* ... */
  }

  return { devices, messages, canSend, onSendMessage, /* ... */ }
}
```

### 6.3 `pages/home/index.vue`（改一行）

```vue
<script setup lang="ts">
import { inject } from 'vue'
import { SYNRA_BRIDGE_KEY, type PluginBridge } from '@synra/plugin-sdk'
import { useMessagesPage } from '../../src/lib/composables/useMessagesPage'

const bridge = inject<PluginBridge>(SYNRA_BRIDGE_KEY)
if (!bridge) {
  throw new Error('PluginBridge not provided — plugin must be loaded via host router.')
}

const {
  devices,
  messages,
  canSend,
  onSendMessage,
  messageInput,
  sendError,
  sending,
  selectedDeviceId,
  selectedDeviceLabel,
  selectedStatusShort,
  selectedStatusLong
} = useMessagesPage(bridge)
</script>
```

### 6.4 `vite.config.ts`

```ts
import { defineConfig } from '@synra/plugin-sdk/vite'
export default defineConfig()
// 全 inline，零外部依赖
```

### 6.5 `package.json`

```jsonc
{
  "dependencies": {}, // plugin bundle 不需要任何 runtime dep
  "peerDependencies": {
    "@synra/plugin-sdk": "^0.2.0" // 仅类型
  }
}
```

---

## 7. State 共享验证

| 场景                                 | 旧设计                                              | 新设计                                                                        |
| ------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------- |
| Host 端 pairing 完成 → bump epoch    | 写 `pairedDevicesStorageEpoch.value++`（host 单例） | 写 `pairedDevicesStorageEpoch.value++`（host 单例，**未变**）                 |
| Plugin `useMessagesPage` watch epoch | 读同一个 ref（仅在 dev 偶然成立）                   | 读 `bridge.usePairedDevices()` 返回的 ref，**closure 绑定 host 单例**，必共享 |
| Host 端 device discovery             | 走 host 的 runtime singleton                        | 走 host 的 runtime singleton（未变）                                          |
| Plugin 端读 device list              | 拿另一份 `getConnectionRuntime()`                   | 通过 bridge 拿 host 那一份（**closure 必共享**）                              |
| 多 plugin 并存                       | module singleton 全局共享，污染                     | bridge 按 plugin 隔离；host 单例只读不写                                      |

`@synra/hooks` 里的 module singleton 保留在 host 端。Plugin bundle 不再依赖 `@synra/hooks`，所以这个 singleton 的"host 单份"特性自然成立。

---

## 8. 落地步骤

| #   | 任务                                                                                                                                                                                               | 关键文件                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | 在 `@synra/plugin-sdk/src/plugin-bridge.ts` 实现 `PluginBridge` 类型 + `createPluginBridge` 工厂（含 `usePairedDevices` / `useSynraPluginEnvelope` / `send` / `broadcast` / `fetch` / `readFile`） | `packages/plugin-sdk/src/plugin-bridge.ts`                   |
| 2   | 重写 `@synra/plugin-sdk/src/index.ts`：导出 `SynraPlugin` / `PluginBridge` / `SYNRA_BRIDGE_KEY` / 类型别名；移除 `SynraActionPlugin` 等 runtime 残留                                               | `packages/plugin-sdk/src/index.ts`                           |
| 3   | 改 `defineConfig`：默认 `neverBundle = []`（plugin bundle 完全 inline）                                                                                                                            | `packages/plugin-sdk/src/vite/index.ts`                      |
| 4   | 改 `PluginRouteBinder`：loader 返回 wrapper component `provide(SYNRA_BRIDGE_KEY, bridge)`                                                                                                          | `apps/frontend/src/plugins/host/plugin-route-binder.ts`      |
| 5   | 改 `PluginLifecycleManager`：管理 `bridgesByPluginId` Map；删除 noop plugin                                                                                                                        | `apps/frontend/src/plugins/host/plugin-lifecycle-manager.ts` |
| 6   | 改 `PluginHostFacade`：删除 `createNoopPlugin`，注入 `hostEnv`                                                                                                                                     | `apps/frontend/src/plugins/host/plugin-host-facade.ts`       |
| 7   | 删除 `apps/frontend/vite.config.ts` 的 `synraInstalledPluginWorkspaceResolve` plugin                                                                                                               | `apps/frontend/vite.config.ts`                               |
| 8   | 改 chat plugin：`src/index.ts` / `src/lib/composables/useMessagesPage.ts` / `pages/home/index.vue` / `vite.config.ts`                                                                              | `D:\Projects\synra-plugin-chat`                              |
| 9   | 跑 `vp run check` + `vp run test`                                                                                                                                                                  | —                                                            |
| 10  | 跑 `vp run android`，验证 Android WebView Open 插件能渲染、能和 host pairing 同步                                                                                                                  | —                                                            |

---

## 9. 不做（明确放弃）

- **v2 / 早期 v3 plugin 兼容**：用户已确认激进重写
- **`createSynraSDK` 9-namespace 工厂**：被 `PluginBridge` 替代；后续 capability gating 直接在 `createPluginBridge` 内部按 capability 字符串做，不再需要独立 namespace 层
- **多 runtime（worker / process）的拆分**：plugin 不声明 runtime，host 内部决定。Plugin bundle 是 main-context 代码，跟文档一致
- **`onPluginEnter` / `onPluginExit` 真用起来**：保留 `SynraPlugin` 抽象类（向后兼容 + 未来扩展），但 host 不在第一版主动调用，留作 hook
- **Importmap 路线**：弃用。当前 plugin bundle 完全自包含，根本不需要 importmap

---

## 10. 风险与缓解

| 风险                                                                                                                                       | 缓解                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Chat plugin `usePairedDevices` 用到 `pairedDevicesStorageEpoch`、`useSynraPluginEnvelope` 用到 `useTransport`，host closure 必须 100% 等价 | 把 `usePairedDevices` 和 `useSynraPluginEnvelope` 的实现直接搬到 `createPluginBridge` 里（用 closure 形式），逻辑 byte-for-byte 一致 |
| `usePairedDevices` 在 host 调用一次、plugin 调用一次，会创建两个 ref                                                                       | bridge 内部缓存 `const cached = { pairedDevices, reloadPairedRecords }`，多次调用返回同一个 ref                                      |
| Host `usePairedDevices`（用于 host 自己的 pairing UI）和 plugin `bridge.usePairedDevices()` 是否同源                                       | 都不动 `@synra/hooks` 的 singleton；host 直接用 singleton，bridge closure 也用同一个 singleton。**两端读取同一 ref，必然一致**       |
| Plugin bundle 变大（多了 @synra/hooks + @synra/plugin-sdk 全文）                                                                           | SDK 包总共 4.2 KB + hooks 包约 25 KB；plugin bundle 从 57 KB 涨到 ~85 KB，**可接受**                                                 |
| Android WebView `import()` 还需要 ES module 支持                                                                                           | Capacitor 7+ 默认 WebView 是 Chromium 90+，原生支持 ESM、动态 import、importmap（虽然我们不用）                                      |

---

## 11. 对比一览

| 维度                     | 旧（半成品）                                                 | 新（本次重写）                                            |
| ------------------------ | ------------------------------------------------------------ | --------------------------------------------------------- |
| Plugin bundle 运行时依赖 | `@synra/plugin-sdk`, `@synra/plugin-sdk/hooks`（外部）       | 零                                                        |
| `@synra/plugin-sdk` 角色 | runtime + types                                              | types-only                                                |
| State 共享机制           | module singleton（host 和 plugin 必须同一实例）              | closure（host 创建 bridge，plugin inject 拿到）           |
| 跨宿主兼容性             | 仅 dev 模式有效                                              | Electron dev / prod / Capacitor WebView / 纯 web 一致     |
| Plugin 作者 IDE DX       | `import { usePairedDevices } from '@synra/plugin-sdk/hooks'` | `inject(SYNRA_BRIDGE_KEY)` 一行                           |
| Bundle 体积              | 57 KB                                                        | ~85 KB（+28 KB）                                          |
| Host 改造量              | —                                                            | ~150 行（新增 bridge 工厂 + provide/inject wrapper）      |
| Chat plugin 改造量       | —                                                            | ~30 行（composable 收一个 bridge 参数 + SFC inject 一次） |

---

下一阶段：等用户确认本设计文档后，按第 8 节落地步骤开始实现。
