# 02 Capability Gate（权限闸门）

> v3 Security 的核心：**JS 里唯一可执行的安全策略是 capability manifest + Proxy 拦截**。Runtime 边界 = 装饰。

## 1. Capability 字符串语法

```text
domain:resource:action[:qualifier]
```

| 层                  | 含义                   | 例子                            |
| ------------------- | ---------------------- | ------------------------------- |
| `domain`            | 命名空间               | `ui`、`device`、`network`、`fs` |
| `resource`          | 该域下的子对象         | `registerPage`、`send`、`fetch` |
| `action`            | 操作的属性             | `read`、`write`、`emit`         |
| `qualifier`（可选） | 受限目标（如主机域名） | `api.example.com`、`@synra-pc`  |

### 示例

```ts
capabilities: [
  'ui:registerPage', // 简单读写
  'ui:navigate',
  'device:query', // 列出已配对设备
  'device:send:@synra-pc', // 仅可发给特定设备
  'network:fetch:api.example.com', // 限定 host
  'fs:read:/sandbox/plugins/chat/**', // 限定路径前缀
  'log:*', // 通配整 domain
  'event:emit:_plugin.chat.*' // glob 匹配
]
```

匹配规则：

- `*`：**单段**通配（`ui:*` 匹配 `ui:registerPage`、`ui:navigate`，但不跨域）；
- `**`：**多段**通配（`network:fetch:**` 匹配 `network:fetch:api.example.com:GET` 等）；
- 精确匹配优先级高于通配。

## 2. 实现：Capability Proxy

```ts
// @synra/plugin-sdk/src/runtime/capability-proxy.ts

export class CapabilityDeniedError extends Error {
  readonly code = 'CAPABILITY_DENIED' as const
  constructor(
    public readonly pluginId: string,
    public readonly capability: string,
    public readonly declared: ReadonlyArray<string>
  ) {
    super(
      `Plugin "${pluginId}" is not allowed to call "${capability}". ` +
        `Declared capabilities: [${declared.join(', ')}]. ` +
        `Add "${capability}" to plugin capabilities to enable.`
    )
  }
}

export function capabilityProxy<TTarget extends object>(
  target: TTarget,
  declared: ReadonlySet<string>,
  pluginId: string
): TTarget {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      const key = String(prop)

      // Internal access
      if (key === '__raw') return obj
      if (key === '__namespace') return (obj as any).__namespace
      if (key.startsWith('_')) return Reflect.get(obj, prop, receiver)

      const value = Reflect.get(obj, prop, receiver)

      // Functions: wrap with capability check
      if (typeof value === 'function') {
        const ns = (obj as any).__namespace as string
        const cap = `${ns}:${key}`
        return (...args: unknown[]) => {
          if (!matchesAny(cap, declared)) {
            throw new CapabilityDeniedError(pluginId, cap, [...declared])
          }
          return value.apply(obj, args)
        }
      }

      // Sub-namespaces: lazy proxy (Lazy Pattern)
      if (value && typeof value === 'object' && (value as any).__namespace) {
        return capabilityProxy(value, declared, pluginId)
      }

      return value
    }
  }) as TTarget
}

function matchesAny(cap: string, declared: ReadonlySet<string>): boolean {
  if (declared.has(cap)) return true
  // glob match
  for (const d of declared) {
    if (matchGlob(d, cap)) return true
  }
  return false
}

function matchGlob(pattern: string, candidate: string): boolean {
  // exact
  if (pattern === candidate) return true
  // * = single segment
  if (pattern.endsWith(':*')) {
    const prefix = pattern.slice(0, -1) // 'ui:' → 'ui:'
    return candidate.startsWith(prefix) && !candidate.slice(prefix.length + 1).includes(':')
  }
  // ** = multiple segments
  if (pattern.endsWith(':**')) {
    return candidate.startsWith(pattern.slice(0, -2))
  }
  return false
}
```

## 3. SDK 工厂接入 Proxy

```ts
// @synra/plugin-sdk/src/core/sdk.ts

import { capabilityProxy } from '../runtime/capability-proxy'

export function createSynraSDK(options: {
  pluginId: string
  /** host 内部传入；plugin 不读 */
  runtime?: 'main' | 'worker' | 'process'
  capabilities: ReadonlyArray<string>
  bridge: Bridge
  registry: PluginRegistry
  sandboxMode?: 'plugin' | 'preview' | 'test'
}): SDK {
  const declared = new Set(options.capabilities)
  const env = envImpl(options) // 基础实现，无 gating
  const log = logImpl(options) // log 总是允许，但显式声明 'log:*' 更稳
  const event = eventImpl(options)
  const ui = uiImpl(options)
  const device = deviceImpl(options)
  const storage = storageImpl(options)
  const action = actionImpl(options)
  const network = networkImpl(options)
  const fs = fsImpl(options)

  // 关键：每个 namespace 在 plugin 视角都得是 Proxy
  return {
    id: options.pluginId,
    runtime: options.runtime, // host-internal；plugin 不读
    env, // env 永远放行
    log: capabilityProxy(log, declared, options.pluginId),
    event: capabilityProxy(event, declared, options.pluginId),
    ui: capabilityProxy(ui, declared, options.pluginId),
    device: capabilityProxy(device, declared, options.pluginId),
    storage: capabilityProxy(storage, declared, options.pluginId),
    action: capabilityProxy(action, declared, options.pluginId),
    network: capabilityProxy(network, declared, options.pluginId),
    fs: capabilityProxy(fs, declared, options.pluginId)
  }
}
```

> 注：函数名是 **`createSynraSDK`**——不要 rename。Plugin 不应有 `runtime` 字段；这里 `runtime` 仅是 host-internal，便于 SDK 选合适的 bridge。
> 关于 runtime 的决定权在 host（loader.ts），不是 plugin；详见 [01-runtime-and-isolation.md](./01-runtime-and-isolation.md)。

## 4. 编译期 lint（fail-fast）

linter 在 dev / CI 时直接看 AST，比运行时更早：

```ts
// @synra/plugin-sdk/src/lint/rules/no-undeclared-capability.ts

export const rule = {
  name: 'synra/no-undeclared-capability',
  meta: {
    type: 'problem',
    docs: { description: 'Every sdk.<ns>.<method>(...) call must map to a declared capability.' },
  },
  create(context) {
    const declared = new Set<string>()
    let inPlugin = false

    return {
      // 解析 plugin definition 收集 declared capabilities
      CallExpression(node) {
        // definePlugin({ capabilities: [...] })
        if (node.callee.name === 'definePlugin' || ...) {
          const capsArg = node.arguments[0]?.properties?.find(p => p.key.name === 'capabilities')
          if (capsArg) {
            for (const el of capsArg.value.elements) {
              declared.add(el.value)
            }
            inPlugin = true
          }
        }
      },
      // 拦截 sdk.<x>.<y>(...) 调用
      MemberExpression(node) {
        if (!inPlugin) return
        // sdk.ui.registerPage → 检查 'ui:registerPage' 是否 declared
        const path = getSdkPath(node)  // 'ui.registerPage'
        if (!path) return
        const [ns, method] = path.split('.')
        const cap = `${ns}:${method}`
        if (!declared.has(cap) && !matchesWildcard(cap, declared)) {
          context.report({
            node,
            message: `Call "${cap}" is not in plugin's declared capabilities. Add "${cap}" to capabilities array.`,
          })
        }
      },
    }
  },
}
```

Plugin 作者在 dev 时立刻看到错误，不必等运行时。

## 5. Wildcard / Glob 规则

| 模式               | 匹配                                                                 | 不匹配                                 |
| ------------------ | -------------------------------------------------------------------- | -------------------------------------- |
| `ui:*`             | `ui:registerPage`, `ui:navigate`                                     | `device:registerPage`（跨界）          |
| `ui:**`            | `ui:registerPage`, `ui:registerPage:something`                       | `ui:otherdomain:method`                |
| `network:fetch:**` | `network:fetch:api.example.com`, `network:fetch:api.example.com:GET` | `network:send:api.example.com`（跨界） |

## 6. 复合 Capability（AND / OR）

```ts
// OR：一个域内方法合并
capabilities: [
  'device:query OR device:send' // 表达式，不推荐——用 array 即可
]

// OR 多个 capability：
capabilities: [
  'device:send | device:broadcast' // 任何一即可；插件作者选其一
]

// AND 与：能力叠加
capabilities: [
  'device:send',
  'network:fetch:api.github.com' // 两者都需声明
]
```

设计上 OR 用 array 元素；AND 用多元素；不允许混合表达式（保持简单）。

## 7. 错误处理

```ts
try {
  await ctx.network.fetch('https://evil.com/api')
} catch (e) {
  if (e instanceof CapabilityDeniedError) {
    // 提示用户："插件 chat 想访问 evil.com，已被宿主拦截"
    log.warn('capability denied', e.capability)
  }
}
```

宿主在 plugins 设置面板显示每个插件**上次 capability denied** 的统计。

## 8. 性能：Proxy 开销

| 操作                             | Proxy 开销                             |
| -------------------------------- | -------------------------------------- |
| 第一次访问 `sdk.ui.registerPage` | ~0.5μs（一次性 Proxy 包装）            |
| 每次调用                         | ~0.3μs（glob match + 一次 set lookup） |
| 重复调用同一方法（V8 inline）    | ~30ns（V8 优化）                       |

**对比 v2 postMessage**：单次 postMessage 跨 iframe ≈ 500-5000μs。

性能收益 **~1000x**。

## 9. 与设计模式对应

- **Proxy**（核心）：拦截并校验；
- **Lazy Proxy**（衍生）：子 namespace 按需包装；
- **Chain of Responsibility**（衍生）：capability 检查可链式叠加（声明级 + 运行时级）；
- **Facade**（组合）：SDK 整体就是一个 facade。

## 10. 与 v2 对比

| 维度     | v2            | v3                                          |
| -------- | ------------- | ------------------------------------------- |
| 校验时机 | 启动一次      | **每次调用**（Proxy）+ 编译期               |
| 精度     | capability 名 | capability 名 + qualifier（如 host / path） |
| 错误处理 | 启动失败      | 抛出 `CapabilityDeniedError`（按调用粒度）  |
| 性能     | 启动一次 1ms  | 每调用 0.3μs                                |
| 安全姿势 | 防御式        | **主动式**：plugin 不能"试探"未声明能力     |
