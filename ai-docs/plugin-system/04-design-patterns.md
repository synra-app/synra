# 04 Design Patterns（v3 显式采用的设计模式）

> 本节列出 v3 系统**显式选择**的设计模式，每个模式给出：意图、落地位置、代码示例、为什么这样选。
>
> **原则**：设计模式是被动工具。不为用而用——只解决具体问题。v3 共用了 13+ 个模式，每个都有真实落点。

---

## 1. Proxy — Capability Gate

**意图**：在不修改原对象的前提下，拦截访问，做权限校验。

**落地**：`@synra/plugin-sdk/src/runtime/capability-proxy.ts`

**为什么**：安全策略必须是 dynamic（plugin 安装后变更） + per-call（不能让 plugin 试探）。Proxy 是唯一方案。

详见 [02-capability-gate.md](./02-capability-gate.md)。

```ts
const sdkDevice = capabilityProxy(deviceImpl, declared, pluginId)
await sdkDevice.send('@synra-pc', ...)  // → Proxy 拦截 'device.send' 检查
```

---

## 2. Lazy Proxy — Namespace 按需包装

**意图**：延迟昂贵对象的创建，直到第一次访问。

**落地**：`@synra/plugin-sdk/src/core/sdk.ts`（getter + Map 缓存）

**为什么**：插件作者可能只用 `device.*` 3 个方法，但创建全部 9 个 namespace 的 Proxy 一上来就要写 9 个 Proxy trap。Lazy 让未用的 namespace 根本不实例化。

```ts
const proxies = new Map<string, any>()
return {
  get log() {
    if (!proxies.has('log')) proxies.set('log', capabilityProxy(logImpl(), declared, id))
    return proxies.get('log')
  },
  get device() {
    /* ... */
  }
  // ...
}
```

---

## 3. Factory — `createSynraSDK`、`definePlugin`

**意图**：把创建逻辑集中管理，可注入参数。

**落地**：`createSynraSDK({ pluginId, runtime, capabilities, bridge, registry })` 在每个 host 里被唯一调用。

> 函数名 **`createSynraSDK`**——不要 rename 为 `createSDK` 之类。

**为什么**：plugin 是 **数据**（定义）而非命令，**创建** 是 host 的责任。Factory 把"创建时要校验、要注入"的逻辑全收口。

---

## 4. Adapter — Bridge 不同 runtime

**意图**：把一个接口转换为另一个接口，让多个"platform 形状"对 plugin 一致。

**落地**：`@synra/plugin-sdk/src/runtime/bridge/{main,worker,process}.ts`

**为什么**：plugin 想写 `ctx.device.send(...)`——在 main 是直接调用，在 worker / process 是经 MessageChannel 转发。Adapter 把"如何转发"封装好，plugin 不感知。

```ts
// main.ts
call(target, method, args) { /* 直接 in-process 调用 */ }

// worker.ts
call(target, method, args) {
  // postMessage 到 host worker，listener 回调拿结果
}

// process.ts (Electron)
call(target, method, args) {
  // utilityProcess MessagePortMain 同上，但跨 Node 子进程
}
```

Host 内部根据 `runtime` 选择对应 adapter：

```ts
const bridge = (() => {
  switch (runtime.kind) {
    case 'main':
      return createMainBridge(registry)
    case 'worker':
      return createWorkerBridge(runtime.port)
    case 'process':
      return createProcessBridge(runtime.port)
  }
})()
const sdk = createSynraSDK({ pluginId, runtime: runtime.kind, capabilities, bridge, registry })
```

---

## 5. Strategy — Host 决定 runtime（plugin 不参与）

**意图**：定义一族算法（一组可互替的隔离容器），让它们可互换。

**落地**：`apps/web/src/plugins/runtime-allocator.ts`（host 内部），按 plugin 声明 + host env 选 `main / worker / process`。

**为什么**：v2 把 isolation 固化在 plugin 模型里（4 个 runtime 永远同时存在）；v3 让 plugin **不写** runtime 字段，host **按需升级**。

```ts
export async function allocate(plugin: PluginManifest, env: HostEnv): Promise<Runtime> {
  if (plugin.capabilities.some((c) => c.startsWith('fs:') || c.startsWith('native:'))) {
    if (env.supports.process)
      return { kind: 'process', port: await env.spawnUtilityProcess(plugin) }
  }
  if (plugin.hints?.includes('cpu-heavy') && env.supports.worker) {
    return { kind: 'worker', port: await env.spawnWorker(plugin) }
  }
  return { kind: 'main' }
}
```

> 重要：`plugin.isolation` / `plugin.runtime` / `plugin.kind` 都不存在——plugin 不该写。详见 [01-runtime-and-isolation.md](./01-runtime-and-isolation.md)。

---

## 6. Decorator — 注解包装

**意图**：动态给对象加职责（额外行为），不改原对象结构。

**落地**：`@synra/plugin-sdk/src/runtime/decorators/` 提供 `@memoize`、`@throttle`、`@debounce`，可用于 plugin 内的 method。

**为什么**：plugin 写的 handler 经常需要节流（如 chat 的打字事件）。Decorators 比让 plugin 作者手写 `lodash.throttle` 更优雅，且保留类型。

```ts
class ChatPlugin {
  @memoize({ ttl: 1000 })
  async getUser(id: string) {
    return fetch(`/api/users/${id}`).then((r) => r.json())
  }

  @throttle({ wait: 200 })
  onTyping(text: string) {
    /* ... */
  }
}
```

也用于 SDK 内部：

```ts
class LogNamespace {
  @memoize({ ttl: 100 })
  getChildLogger(prefix: string) {
    /* ... */
  }
}
```

---

## 7. Mediator — Event Bus

**意图**：用一个中心对象（mediator）协调多个同事对象之间的交互，避免互相直接引用。

**落地**：`@synra/plugin-sdk/src/namespaces/event.ts` 实现 `EventNamespace`，是 plugin 间事件的中央协调器。

**为什么**：plugin A 想通知 plugin B "用户登录"——不该直接 import B 的回调。Mediator 解耦：emit + subscribe，所有 plugin 只见 `ctx.event`。

```ts
// plugin A
ctx.event.emit('_plugin.user.auth.completed', { userId: 'u123' })

// plugin B
ctx.event.subscribe('_plugin.user.auth.*', (payload) => {
  if (payload.userId) refreshStateFor(payload.userId)
})
```

`ctx.event` 是 Mediator；plugin 不需要知道彼此（Loose Coupling）。

---

## 8. Composite — Plugin 组合其他插件

**意图**：把一组对象组合成"树"结构，统一对外接口。

**落地**：`PluginDef.compose` 字段——一个 plugin 可声明依赖其他 plugin。

**为什么**：插件作者常写 "我先要 `utils-plugin` 提供的 `formatDate`，再启用我自己"。Composite 让"依赖 + 启用顺序 + compose 失败就禁用" 一体化。

```ts
// utils-plugin
definePlugin({
  id: '@synra/utils-format',
  capabilities: ['log:*'],
  setup(ctx) {
    /* 注册 formatDate 到 ctx */
  }
})

// chat-plugin
definePlugin({
  id: '@synra-plugin/chat',
  compose: ['@synra/utils-format'],
  setup(ctx) {
    // 期待 utils-format 已经注册；但这里只是声明依赖
  }
})
```

宿主在 enable `@synra-plugin/chat` 时：

1. 检查所有 compose 项已 enabled；
2. 如果缺失 → 给提示，询问用户先启用 compose；
3. 都齐了 → enable 本 plugin；
4. 当 compose 项 disabled → 自动 disable 本 plugin（如果设置了 `cascade: true`）。

Plugin 在 Registry 视图中是一棵树：

```text
@synra/utils-format (leaf)
└── @synra-plugin/chat (child)
    └── @synra-plugin/chat-bots (grand-child)
```

---

## 9. Registry — Plugin 中心管理

**意图**：维护一个可枚举的对象集合，提供"按 id 查找"和"按 lifecycle 查询"。

**落地**：`apps/web/src/plugins/registry.ts`（`PluginRegistry` 类）。

**为什么**：host 要管理 "已 enabled / 已 disabled / 已 loaded / 正在加载中 / 加载失败" 几种状态——一个集中 registry 让 logic 容易。

```ts
class PluginRegistry {
  readonly entries = new Map<string, PluginEntry>()

  register(declared: PluginManifest) {
    /* 不加载，只登记 */
  }
  enable(pluginId: string): Promise<void> {
    /* 加载 + setup */
  }
  disable(pluginId: string): Promise<void> {
    /* teardown */
  }
  get(id: string): PluginEntry {
    /* ... */
  }
  list(filter?: { enabled?: boolean; isolation?: IsolationLevel }): PluginEntry[]
  on(event: 'change' | 'error', handler): () => void
}
```

Registry 通知用观察者（见 #10）。

---

## 10. Observer — 状态变化通知

**意图**：对象状态变化时通知所有订阅者。

**落地**：`PluginRegistry.on('change', handler)`、`PluginRegistry.on('error', handler)`。

**为什么**：UI（Plugins 设置面板）要响应 enable/disable 变化；运行时（dashboard）要响应 error。Observer 让 model → view 解耦。

```ts
const off = registry.on('change', ({ id, status }) => {
  if (status === 'enabled') console.log('plugin ready')
})
off() // 取消订阅
```

---

## 11. Builder / Fluent — Plugin 定义构造器

**意图**：把复杂对象的构建过程分解为多步骤，每步返回 this 供链式调用。

**落地**：可作为 `definePlugin` 的副 API 提供（可选）。

```ts
// 链式
export default plugin('chat')
  .id('@synra-plugin/chat')
  .version('1.0.0')
  .cap('ui:registerPage')
  .cap('device:send')
  .setup(async (ctx) => {
    /* ... */
  })
  .build()
```

或保留 v2 风格的 `definePlugin({...})` 默认即可。两条 API 都可。

---

## 12. Chain of Responsibility — Capability 校验链

**意图**：多个处理对象串成链，依次尝试处理请求。

**落地**：capability 校验有 3 层：

1. **Build-time lint**（chain 第一层）：AST 静态分析；
2. **Bundle loader 校验**（第二层）：加载时校验 capabilities 字符串 syntax；
3. **Runtime Proxy 校验**（第三层）：每次调用拦截。

任一层 fail 即终止。

```text
lint fail → dev 立即报，不进 bundle
loader fail → 加载拒收
proxy fail → 调用抛 CapabilityDeniedError
```

每一层只管自己的一段职责。

---

## 13. Module / Facade — SDK 整体是 facade

**意图**：为一组复杂子系统提供统一的高层接口。

**落地**：`SDK` 整个对象，对外看是简单的 9 个 namespace，内部是很多模块的协调。

**为什么**：plugin 作者知道 `ctx.device.send(...)` 就够了，不需要知道背后是 `Bridge` 调用、`Adapter` 选择、capability Proxy 校验、Registry 记录、Event 转发——这一堆。

---

## 14. Template Method — Setup / Teardown 框架

**意图**：在父类定义算法骨架，子类覆盖特定步骤。

**落地**：host 持有"plugin 启停"框架：

```ts
async function bootstrap(plugin: PluginManifest, sdk: SDK) {
  // 1. 检查 compose
  await ensureComposed(plugin.compose)
  // 2. 检查 capabilities
  checkCapabilities(plugin.capabilities)
  // 3. 让 plugin 跑 setup
  const teardown = (await plugin.setup(ctx)) ?? defaultTeardown(ctx)
  // 4. 注册 teardown hook
  registry.bindTeardown(plugin.id, teardown)
}
```

Plugin 作者只写 `setup(ctx)`，hook 由 host 接管。

---

## 15. Null Object — 静默能力缺失

**意图**：用 null object 替代 null，让调用方无脑调用。

**落地**：sub-namespace 在 capability 缺失时不是 `undefined`，而是抛 CapabilityDeniedError——比 silent undefined 更好（plugin 立刻知道）。

**反例**：如果 SDK 在 plugin 没声明 `device:send` 时返回 `{ send: () => { /* no-op */ }}`——plugin 写代码没反馈，更难调。

**v3 选择**：抛错 + 编译期 lint 提示。这是显式 strict > 隐式 tolerant。

---

## 16. Memento — Plugin 状态保存 / 恢复

**意图**：不破坏封装的前提下，捕获对象内部状态并外部保存。

**落地**：可选 feature：`storage.local.snapshot()` 让 plugin 在 disable → re-enable 之间保留 user-facing state。

```ts
// plugin setup 内
ctx.storage.local.set('chat:draft', draft)
```

disable 时宿主自动 snapshot 到 `<pluginId>/snapshot.json`；re-enable 时恢复。

---

## 17. 模式汇总表

| 模式                    | 落点                              | 价值              |
| ----------------------- | --------------------------------- | ----------------- |
| Proxy                   | capability gate                   | 安全              |
| Lazy Proxy              | namespace 包装                    | 启动快            |
| Factory                 | createSDK                         | 注入统一          |
| Adapter                 | bridge/{web,worker,process}       | 平台无关          |
| Strategy                | isolation select                  | plugin 自由声明   |
| Decorator               | @memoize/@throttle                | 复用 handler 语义 |
| Mediator                | event bus                         | plugin 解耦       |
| Composite               | plugin compose                    | 依赖管理          |
| Registry                | plugin registry                   | 集中状态          |
| Observer                | registry events                   | UI 响应           |
| Builder                 | plugin chain API                  | 写作友好          |
| Chain of Responsibility | cap 校验 3 层                     | 分层 fail-fast    |
| Facade / Module         | SDK 整体                          | 简化接口          |
| Template Method         | bootstrap                         | 流程统一          |
| Null Object             | (拒绝使用 — strict 优于 tolerant) | —                 |
| Memento                 | snapshot                          | 状态保留          |

## 与 v2 对比

v2 用了哪些模式？

- _Mediator_ — envelope via useSynraSystemEnvelope
- _Observer_ — DeviceConnection.onMessage
- _Registry_ — partial, 在 PluginRegistry
- _Adapter_ — Capacitor/Electron two bridges（碎片化）

v2 把"插件 vs host" 边界复杂化（4 runtime），导致许多模式被扭曲。v3 用单一 context 后，模式变得纯粹——尤其是 Proxy 和 Composite，从不可能变成自然。

## 设计模式不是装饰——它们是 v3 的骨架

v3 的代码可读性、性能、扩展性 都依赖于这些模式被**正确实施**。任何一个被跳过，安全或可扩展性都会出问题。
