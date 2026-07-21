# 03 SDK Surface

> v3 SDK 设计原则：**一个 `createSynraSDK` 工厂**、**9 个 namespace**、**全部 Lazy Proxy**、**Plugin 不接触 runtime 字段**。

## 1. `createSynraSDK` 总入口（不要改名）

```ts
// @synra/plugin-sdk/src/core/sdk.ts
import type { Bridge } from '../runtime/bridge'
import type { PluginRegistry } from '../runtime/registry'

export type PluginRuntime = 'main' | 'worker' | 'process'

export interface SDKOptions {
  readonly pluginId: string
  /** host 内部传入；plugin 不读写；不导出在用户文档 */
  readonly runtime?: PluginRuntime
  readonly sandboxMode?: 'plugin' | 'preview' | 'test'
  /** Plugin manifest 声明的 capability 列表（必传） */
  readonly capabilities: ReadonlyArray<string>
  /** host 创建的 bridge（按 runtime 选 main / worker / process） */
  readonly bridge: Bridge
  readonly registry: PluginRegistry
  /** 父 plugin id（composite 场景；可空） */
  readonly parentPluginId?: string
}

export interface SDK {
  readonly id: string
  /** host 内部用的；plugin 不应依赖此字段做逻辑分支 */
  readonly runtime?: PluginRuntime
  readonly env: EnvNamespace
  readonly log: LogNamespace
  readonly event: EventNamespace
  readonly ui: UINamespace
  readonly device: DeviceNamespace
  readonly storage: StorageNamespace
  readonly action: ActionNamespace
  readonly network: NetworkNamespace
  readonly fs: FsNamespace
  /** 类型 marker，编译期可分型 */
  readonly __brand: 'synra-sdk'
}

/**
 * 创建 plugin 用的 SDK 实例。
 * **调用方仅 host**——plugin 不会自己调用此函数。
 */
export function createSynraSDK(options: SDKOptions): SDK {
  if (!options.pluginId) throw new Error('createSynraSDK: pluginId is required')
  if (!Array.isArray(options.capabilities))
    throw new Error('createSynraSDK: capabilities is required')
  // ...
}
```

> 注：`runtime` 字段存在但 plugin **不应**读。Host 内部传进来；plugin 不出现 `sdk.runtime === 'worker'` 之类的判断。如果 plugin 想"知道自己在哪跑"，那是反模式——应该看 SDK 行为而不是 runtime 标签。

## 2. 9 个 Namespace

每个 namespace 是被 capability Proxy 包装的对象。下面是接口形状。

### 2.1 `env` — 永远放行

```ts
export interface EnvNamespace {
  __namespace: 'env'
  readonly sdkVersion: string
  readonly runtime: 'main' | 'worker' | 'process'
  readonly mode: 'plugin' | 'preview' | 'test'
  readonly appVersion: string
  readonly locale: string
  readonly darkMode: boolean
  can(capability: string): boolean
}
```

Plugin 不需要 cap declaration 就能调用（与 v3 前版一致）。Plugin 能看到 `env.runtime` 来知道当前在哪个容器——**但**通常应避免依赖。

### 2.2 `log`

```ts
export interface LogNamespace {
  __namespace: 'log'
  debug(message: string, ctx?: Record<string, unknown>): void
  info(message: string, ctx?: Record<string, unknown>): void
  warn(message: string, ctx?: Record<string, unknown>): void
  error(message: string, ctx?: Record<string, unknown>): void
  child(prefix: string): LogNamespace
  flush(): Promise<void>
}
```

### 2.3 `event`

```ts
export interface EventNamespace {
  __namespace: 'event'
  emit(event: string, payload: unknown): Promise<void>
  subscribe(eventPattern: string, handler: (payload: unknown) => void): () => void
}
```

### 2.4 `ui`

```ts
export interface UINamespace {
  __namespace: 'ui'
  registerPage(pageKey: string, loader: () => Promise<Component>): Promise<void>
  unregisterPage(pageKey: string): Promise<void>
  navigate(pageKey: string, params?: Record<string, unknown>): Promise<void>
  toast(message: string, options?: ToastOptions): Promise<void>
  confirm(message: string, options?: ConfirmOptions): Promise<boolean>
  notify(title: string, body: string, options?: NotifyOptions): Promise<void>
  modal(content: Component | string, options?: ModalOptions): Promise<unknown>
}
```

### 2.5 `device`

```ts
export interface DeviceTarget {
  readonly id: string
  readonly name: string
  readonly kind: 'desktop' | 'mobile' | 'headless'
}

export interface DeviceNamespace {
  __namespace: 'device'
  list(): Promise<ReadonlyArray<DeviceTarget>>
  onReady(handler: (device: DeviceTarget) => void): () => void
  send<T = unknown>(target: string, message: { event: string; payload: T }): Promise<void>
  broadcast<T = unknown>(message: { event: string; payload: T }): Promise<void>
  onMessage<T = unknown>(
    pattern: string,
    handler: (msg: { payload: T; from: DeviceTarget }, target: DeviceTarget) => void
  ): () => void
  registerAction<TArgs, TResp>(
    name: string,
    schema: JSONSchema,
    fn: (args: TArgs) => Promise<TResp>
  ): () => void
  invokeAction<TArgs, TResp>(pluginId: string, name: string, args: TArgs): Promise<TResp>
}
```

### 2.6 `storage`

```ts
export interface StorageNamespace {
  __namespace: 'storage'
  local: {
    get<T>(key: string): Promise<T | undefined>
    set<T>(key: string, value: T): Promise<void>
    delete(key: string): Promise<void>
    keys(prefix?: string): Promise<ReadonlyArray<string>>
    clear(): Promise<void>
  }
  secure: {
    get<T>(key: string): Promise<T | undefined>
    set<T>(key: string, value: T): Promise<void>
    delete(key: string): Promise<void>
  }
  readonly quota: { usedBytes: number; maxBytes: number }
}
```

存到 `${pluginId}:${key}` 命名空间。

### 2.7 `action`

```ts
export interface ActionNamespace {
  __namespace: 'action'
  declare<TArgs, TResp>(
    name: string,
    schema: ActionSchema,
    handler: (args: TArgs) => Promise<TResp>
  ): () => void
  list(): ReadonlyArray<{ pluginId: string; name: string; schema: ActionSchema }>
}
```

### 2.8 `network`

```ts
export interface NetworkNamespace {
  __namespace: 'network'
  fetch(input: string | URL, init?: RequestInit): Promise<Response>
  webSocket(url: string | URL, protocols?: string | string[]): WebSocket
}
```

Capability 更细：

```ts
capabilities: [
  'network:fetch:api.github.com',
  'network:fetch:api.example.com:POST',
  'network:webSocket:wss://realtime.example.com'
]
```

### 2.9 `fs`

```ts
export interface FsNamespace {
  __namespace: 'fs'
  readonly cwd: string
  read(path: string, opts?: { encoding?: 'utf-8' | 'binary' }): Promise<string | Uint8Array>
  write(path: string, data: string | Uint8Array): Promise<void>
  list(path: string): Promise<ReadonlyArray<{ name: string; isDir: boolean }>>
  delete(path: string): Promise<void>
  mkdir(path: string): Promise<void>
  stat(path: string): Promise<{ size: number; mtimeBytes: number; mtimeMs: number }>
  watch?(path: string, handler: (event: 'change' | 'rename') => void): () => void
}
```

所有路径限制在 `<sandboxRoot>/<pluginId>/`。超出抛 `PathEscapeError`。

## 3. Lazy Proxy

```ts
// @synra/plugin-sdk/src/core/sdk.ts
export function createSynraSDK(options: SDKOptions): SDK {
  const declared = new Set(options.capabilities)
  const wrap = <T extends object>(ns: string, impl: T): T => {
    if (proxies.has(ns)) return proxies.get(ns)!
    const proxied = capabilityProxy(impl, declared, options.pluginId)
    proxies.set(ns, proxied)
    return proxied
  }

  return {
    id: options.pluginId,
    runtime: options.runtime, // host-internal
    env: envImpl(options), // env 不 gate
    get log() {
      return wrap('log', logImpl(options))
    },
    get event() {
      return wrap('event', eventImpl(options))
    },
    get ui() {
      return wrap('ui', uiImpl(options))
    },
    get device() {
      return wrap('device', deviceImpl(options))
    },
    get storage() {
      return wrap('storage', storageImpl(options))
    },
    get action() {
      return wrap('action', actionImpl(options))
    },
    get network() {
      return wrap('network', networkImpl(options))
    },
    get fs() {
      return wrap('fs', fsImpl(options))
    },
    __brand: 'synra-sdk'
  }
}
```

## 4. Plugin Definition API

```ts
// @synra/plugin-sdk/src/core/plugin.ts
export interface PluginContext extends SDK {
  readonly utils: {
    uuid(): string
    sleep(ms: number): Promise<void>
    hash(s: string): string
  }
  readonly dispose: () => Promise<void>
}

export interface PluginDef {
  readonly id: string
  readonly version: string
  readonly name?: string
  readonly description?: string
  /** 不写 isolation — 留给 host */
  readonly hints?: ReadonlyArray<'ui-heavy' | 'cpu-heavy' | 'io-heavy' | 'long-running'>
  /** 同进程内依赖的其他 plugin */
  readonly compose?: ReadonlyArray<string>
  readonly capabilities: ReadonlyArray<string>

  setup(ctx: PluginContext): void | (() => Promise<void>)
  /** 可选：disable 时调用 */
  teardown?(ctx: PluginContext): Promise<void>
}

export function definePlugin<T extends PluginDef>(def: T): T {
  return def
}
```

注意：

- **没有 `isolation: 'main' | 'worker' | 'process'` 字段**；
- **没有 `runtime` 字段**；
- **没有 `kind` 字段**；
- 没有 `target` 字段；
- 只有 `capabilities` 是必填的；`hints` 可选。

## 5. 平台无关：bridge 是 host 的内部事

```ts
// @synra/plugin-sdk/src/runtime/bridge/main.ts
export function createMainBridge(registry: PluginRegistry): Bridge {
  return {
    call(target, method, args) {
      // in-process
      const entry = registry.require(target)
      return entry.instance!.module.default[method](...args)
    }
  }
}

// @synra/plugin-sdk/src/runtime/bridge/worker.ts
export function createWorkerBridge(port: MessagePort): Bridge {
  return new Promise((resolve, reject) => {
    const callId = uuid()
    port.postMessage({ type: 'synra.bridge.call', callId, target, method, args })
    const handler = (e) => {
      /* ... */
    }
    port.addEventListener('message', handler)
  })
}

// @synra/plugin-sdk/src/runtime/bridge/process.ts
export function createProcessBridge(port: MessagePortMain): Bridge {
  // 类似 worker，跨 Electron utilityProcess
}
```

Host 内部按分配的 runtime 选对应 bridge：

```ts
const bridge = (() => {
  switch (runtime) {
    case 'main':
      return createMainBridge(registry)
    case 'worker':
      return createWorkerBridge(port)
    case 'process':
      return createProcessBridge(port)
  }
})()

const sdk = createSynraSDK({ pluginId, runtime, capabilities, bridge, registry })
```

Plugin 看到的 `ctx.device.send(...)` 在三个 runtime 下都用同一 API。

## 6. 类型强约束

```ts
// 全 discriminated union；plugin 不会看到 any

export interface DeviceSendMessage<TPayload = unknown> {
  event: string
  payload: TPayload
}

export interface DeviceNamespace {
  send<TPayload = unknown>(target: string, message: DeviceSendMessage<TPayload>): Promise<void>
  // ...
}

export interface ActionSchema {
  args: JSONSchema
  returns: JSONSchema
}
```

## 7. SDK 内部子包结构

```
packages/plugin-sdk/
├── src/
│   ├── index.ts                     # 公开 API
│   ├── core/
│   │   ├── create-synra-sdk.ts      # ★ createSynraSDK 工厂（不要 rename！）
│   │   ├── plugin.ts                # definePlugin
│   │   ├── context.ts               # PluginContext
│   │   └── types.ts
│   ├── namespaces/                  # 9 个 namespace 实现
│   ├── runtime/
│   │   ├── capability-proxy.ts      # ★ Proxy 实现
│   │   ├── bridge/
│   │   │   ├── main.ts
│   │   │   ├── worker.ts
│   │   │   └── process.ts
│   │   └── ...
│   ├── install/                     # ★ npm / git / URL 解析
│   │   ├── npm-source.ts
│   │   ├── git-source.ts
│   │   ├── url-source.ts
│   │   └── lock-resolution.ts
│   ├── sync/                        # ★ 多端自动同步
│   │   ├── broadcast-installed.ts
│   │   ├── receive-sync.ts
│   │   └── envelope-events.ts
│   ├── lint/
│   │   ├── no-undeclared-capability.ts
│   │   └── ...
│   └── cli/
│       ├── build.ts
│       ├── verify.ts
│       ├── sign.ts
│       └── publish.ts
```

## 8. 与 v2 / 早期 v3 对比

| 维度           | v2                          | 早期 v3                        | 本版 v3（2026-07-20）              |
| -------------- | --------------------------- | ------------------------------ | ---------------------------------- |
| 工厂名         | `createSynraSDK`            | `createSDK` ❌                 | **`createSynraSDK`** ✅            |
| PluginDef 字段 | `requires`, `setup`         | `isolation` ❌                 | 无 `isolation` ✅                  |
| `runtime` 字段 | 无                          | `runtime: 'web'                | 'worker'                           | 'process'` ❌ | 不出现于 plugin 视角 ✅ |
| 隔离决策       | 不一致                      | plugin 写                      | **host 决定**                      |
| 安装源         | `entry.ui / host` 双 bundle | `dist/plugin.bundle.js` 单文件 | **npm 包 + `dist/synra/index.js`** |
| 同步           | 手动按钮                    | 手动按钮                       | **自动**                           |

下一节：[04-design-patterns.md](./04-design-patterns.md)。
