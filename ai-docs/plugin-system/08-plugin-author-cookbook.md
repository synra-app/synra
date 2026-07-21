# 08 Plugin Author Cookbook

> 给 plugin 作者的实操指南。读完前面 7 篇，按这一篇写第一个 plugin。
>
> v3 修订：plugin 是 npm 包，**不写** `isolation / runtime / kind`；打包到固定 `dist/synra/index.js`；由 host 在运行时按需从 npm/git/URL 拉取，自动同步多端。
>
> **目录约定**（v3）：`pages/` 在根目录装 Vue 页面（路由概念）；`src/` 下只剩 `index.ts`（plugin 入口）+ 可选 `lib/` `types/`。**不再分** `src/ui/ src/worker/ src/host/ src/shared/`。

## 5 分钟起步

### 1. 创建 plugin 目录（标准 npm 包）

```bash
mkdir chat-plugin && cd chat-plugin
cat > package.json <<'EOF'
{
  "name": "@synra-plugin/chat",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/synra/index.js",
  "module": "dist/synra/index.js",
  "exports": { ".": "./dist/synra/index.js" },
  "dependencies": {
    "vue": "^3.4.0"
  },
  "peerDependencies": { "@synra/plugin-sdk": "^3.0.0" },
  "synra": {
    "id": "@synra-plugin/chat",
    "version": "0.1.0",
    "name": "Chat",
    "minSdkVersion": "3.0.0",
    "capabilities": ["ui:*", "device:query", "device:send", "device:receive", "log:*"],
    "events": {
      "publish": ["_plugin.chat.*"],
      "subscribe": ["_synra.device.*"]
    },
    "network": { "outbound": [] }
  }
}
EOF
```

> 注意：v3 plugin **没有** `isolation` 字段，也没有 `runtime / kind / target / platform / entries.{ui,host,...}`。
> `dependencies` 可以正常写（vue / pinia 等都会被 esbuild 内联进 `dist/synra/index.js`）。

### 2. 写 Vue 页面（pages/ 在根目录）

```vue
<!-- pages/home/index.vue -->
<script setup lang="ts">
import { ref } from 'vue'

const text = ref('')
const messages = ref<Array<{ from: string; text: string }>>([])

defineProps<{ userId?: string }>()
</script>

<template>
  <div class="chat">
    <h1>Chat</h1>
    <input v-model="text" placeholder="say hello..." />
    <ul>
      <li v-for="m in messages" :key="m.from">{{ m.from }}: {{ m.text }}</li>
    </ul>
  </div>
</template>
```

> ✅ Vue 是允许的！`import { ref } from 'vue'` 直接写；build 把 vue 内联进 bundle。
>
> 页面文件 `pages/<pageKey>/index.vue` 与 `src/` **分离**——`pages/` 是路由概念（host 的 vue-router 装载），`src/` 是 plugin 逻辑。

### 3. 写 plugin 入口（src/index.ts）

```ts
// src/index.ts
import { definePlugin, type PluginContext } from '@synra/plugin-sdk'
import HomePage from '../pages/home/index.vue' // ← 跨 pages/ 引用

export default definePlugin({
  id: '@synra-plugin/chat',
  version: '0.1.0',
  capabilities: ['ui:*', 'device:query', 'device:send', 'device:receive', 'log:*'],

  async setup(ctx: PluginContext) {
    const { ui, device, log } = ctx

    // 注册主页（被 host 的 vue-router 装载）
    await ui.registerPage('home', () => HomePage)

    // 监听来自其它端的消息
    device.onMessage('chat.message', async (msg, from) => {
      log.info('chat received', { text: msg.payload.text, from: from.id })
    })

    // 发给桌面
    await device.send('@synra-pc', { event: 'chat.message', payload: { text: 'hi' } })
  },

  async teardown(ctx) {
    await ctx.dispose()
  }
})
```

### 4. Build & 验证

```bash
# 输出 dist/synra/index.js（固定路径）
synra-sdk build

# 校验：bundle 完整性、capability shape、无 node 内置
synra-sdk verify .
```

### 5. 发布

```bash
npm publish --access public
```

用户在 host 的 _Plugins_ 面板写包名（或 git URL / 公开 tarball URL），host 在运行时拉取、安装、构建、注册。

## 目录约定（核心）

```
chat-plugin/
├── pages/                # Vue 页面（路由级）
│   ├── home/index.vue
│   └── settings/index.vue
├── src/                  # plugin 逻辑
│   ├── index.ts          # ★ 唯一入口（definePlugin）
│   ├── lib/              # 纯函数 helpers（无 SDK 依赖）
│   │   ├── events.ts
│   │   └── format.ts
│   └── types/            # 共享类型
│       └── chat.ts
├── icons/plugin.svg
├── package.json          # 含 synra.* 字段
├── tsconfig.json
├── eslint.config.js
└── build.config.ts       # esbuild: outfile → dist/synra/index.js
```

**为什么不分 `src/ui/ src/worker/ src/host/`**：

| 旧拆分（v2）  | v3 处理                                                              |
| ------------- | -------------------------------------------------------------------- |
| `src/ui/`     | ❌ 删；UI 走 `ctx.ui.registerPage(...)`，与逻辑合并在 `src/index.ts` |
| `src/worker/` | ❌ 删；plugin 的"重计算"是 plain function，host 决定是否放 worker    |
| `src/host/`   | ❌ 删；桌面能力走 `ctx.fs.*` / `ctx.network.*`，capability 隔离      |
| `src/shared/` | ⚠️ 重命名 / 合并成 `src/lib/`（不再是"shared"，所有 lib 都是）       |

**为什么 pages/ 在根目录而不是 src/pages/**：

- `pages/` 是路由概念（host vue-router 装载）；
- `src/` 是 plugin 逻辑（setup 入口、helpers、types）；
- 两者**不同轴**——一个 pageKey 一个 SFC，但 page SFC 不该是 plugin 逻辑的一部分。

## Plugin 模板：`synra-sdk create`

```bash
npx synra-sdk create chat
```

生成：

```
chat/
├── pages/
│   └── home/index.vue
├── src/
│   ├── index.ts
│   ├── lib/
│   └── types/
├── package.json
├── tsconfig.json
├── eslint.config.js
├── build.config.ts
└── icons/plugin.svg
```

## 场景示例

### UI + 接收设备消息

```ts
// src/index.ts
import { definePlugin, type PluginContext } from '@synra/plugin-sdk'
import Home from '../pages/home/index.vue'

export default definePlugin({
  id: '@synra-plugin/notifier',
  version: '0.1.0',
  capabilities: ['ui:registerPage', 'device:receive', 'ui:toast', 'log:*'],

  async setup(ctx) {
    const { ui, device, log } = ctx
    await ui.registerPage('home', () => Home)

    device.onMessage('alert.*', async (msg, from) => {
      log.info('alert received', { event: msg.event })
      await ui.toast(`From ${from.name}: ${msg.payload.text ?? ''}`)
    })
  }
})
```

### 暴露 Action 给其它 plugin

```ts
// src/index.ts
import { definePlugin, type PluginContext } from '@synra/plugin-sdk'

export default definePlugin({
  id: '@synra-plugin/dictionary',
  version: '0.1.0',
  capabilities: ['device:registerAction', 'log:*', 'storage:local:*'],

  setup(ctx) {
    const dictionary = new Map<string, string>()

    ctx.device.registerAction(
      'dictionary.lookup',
      { args: { term: 'string' }, returns: 'string|null' },
      async (args: { term: string }) => {
        return dictionary.get(args.term) ?? null
      }
    )

    const stored = await ctx.storage.local.get<Record<string, string>>('dictionary')
    if (stored) Object.entries(stored).forEach(([k, v]) => dictionary.set(k, v))
  }
})
```

### 调用其它 plugin 的 Action

```ts
// src/index.ts
import { definePlugin, type PluginContext } from '@synra/plugin-sdk'

export default definePlugin({
  id: '@synra-plugin/smart-search',
  version: '0.1.0',
  capabilities: ['device:invokeAction'],
  compose: ['@synra-plugin/dictionary'],

  async setup(ctx) {
    const meaning = await ctx.device.invokeAction('@synra-plugin/dictionary', 'dictionary.lookup', {
      term: 'cloud'
    })
  }
})
```

### 跨插件事件订阅

```ts
// src/index.ts
import { definePlugin, type PluginContext } from '@synra/plugin-sdk'
import { CHAT_TEXT_EVENT } from './lib/events' // 复用常量

export default definePlugin({
  id: '@synra-plugin/notes',
  version: '0.1.0',
  capabilities: ['device:send', 'log:*'],

  async setup(ctx) {
    ctx.event.emit('_plugin.notes.user.created', { userId: 'u123' })

    ctx.event.subscribe(CHAT_TEXT_EVENT, ({ payload }) => {
      console.log('user typed', payload.text)
    })
  }
})
```

```ts
// src/lib/events.ts
export const CHAT_TEXT_EVENT = '_plugin.chat.text' as const
export const NOTES_USER_CREATED = '_plugin.notes.user.created' as const
```

### 网络白名单

```ts
// src/index.ts
import { definePlugin } from '@synra/plugin-sdk'

export default definePlugin({
  id: '@synra-plugin/github-stats',
  version: '0.1.0',
  capabilities: ['network:fetch:api.github.com', 'network:fetch:api.github.com:GET', 'log:*'],

  async setup(ctx) {
    const r = await ctx.network.fetch('https://api.github.com/repos/foo/bar')
    // ...
  }
})
```

### CPU 重型任务（host 决策 worker 升级）

```ts
// src/index.ts
import { definePlugin } from '@synra/plugin-sdk'
import { resizeImage } from './lib/image-resize' // 纯函数

export default definePlugin({
  id: '@synra-plugin/image-resizer',
  version: '0.1.0',
  // 无 isolation / runtime 字段；host 看到 hints 后可能升级到 worker
  hints: ['cpu-heavy'],
  capabilities: ['fs:read', 'fs:write', 'log:*'],

  async setup(ctx) {
    ctx.device.registerAction(
      'image.resize',
      {/* schema */},
      async ({ inputPath, outputPath, size }) => {
        const data = await ctx.fs.read(inputPath)
        const resized = await resizeImage(data, size)
        await ctx.fs.write(outputPath, resized)
      }
    )
  }
})
```

> 即使写了 `hints`，plugin 不依赖该字段——host 可忽略，plugin 仍跑 main context。`resizeImage` 是普通函数，host 决定 worker 调度。

## 常见错误与解决

| 错误                                 | 原因                                                    | 解决                                                     |
| ------------------------------------ | ------------------------------------------------------- | -------------------------------------------------------- |
| `CapabilityDeniedError: device.send` | 没声明 `device:send`                                    | 在 `capabilities` 加 `'device:send'`                     |
| `BundleTooLargeError`                | bundle > 5 MB                                           | 拆大资源 / 用 sync asset                                 |
| `CapabilityShapeError`               | capability 字符串不合规                                 | 参考 [02-capability-gate.md §1](./02-capability-gate.md) |
| `NoExportDefaultError`               | `src/index.ts` 没有 `export default definePlugin(...)`  | 检查入口                                                 |
| `ImportsNodeBuiltinError`            | 出现 `import 'node:fs'` 等                              | 用 `ctx.fs.write` 替代                                   |
| `ComposeNotReadyError`               | compose 项未 enabled                                    | 用户需先 enable compose 项                               |
| `SignatureInvalidError`              | bundle 验签失败                                         | 重签 / 重新下载                                          |
| `PageNotFoundError`                  | `ui.registerPage('home')` 找不到 `pages/home/index.vue` | 检查 pages/ 路径与 pageKey 一致                          |

## Debug 工具

```bash
# 显示当前 plugin 的 capability 状态
synra-sdk introspect ./dist/synra/index.js

# 启动 synra-sdk dev 后另开 host：hot reload 监听 24678 ws 端口
synra-sdk dev
```

## 与 v2 对比

| 维度                                 | v2                            | v3                                         |
| ------------------------------------ | ----------------------------- | ------------------------------------------ |
| Plugin 作者工作                      | 看 9 篇文档                   | 看 1 篇 cookbook                           |
| 安装源                               | 手动 zip / 同步               | **npm / git / URL**（host 运行时拉取）     |
| 多端同步                             | 手动 _Sync from desktop_      | **自动**                                   |
| 调试入口                             | postMessage / Worker 调试     | in-process，可用浏览器 DevTools 全程跟踪   |
| 跨端测试                             | 4 个 runtime 各测一次         | 1 个 test，所有端同跑                      |
| 性能调优                             | postMessage 序列化            | 直接 JS call，无 tuning 必要               |
| Bundle 体积策略                      | 双 bundle shared deps 抽离    | 单 bundle 全部内联到 `dist/synra/index.js` |
| 依赖                                 | 必须空                        | **正常 npm deps**                          |
| 目录结构                             | `src/{ui,worker,host,shared}` | **`pages/` + `src/{index,lib,types}`**     |
| `createSynraSDK` 命名                | `createSynraSDK`              | **`createSynraSDK`**（不 rename）          |
| `isolation / runtime / entries` 字段 | plugin 写                     | **不写**（host 内部）                      |

---

v3 plugin 作者的体验是：**写一份 npm 包代码 → `npm publish` → 用户在 host 写包名 → 自动装、自动同步到所有端**。剩下的复杂都被 SDK / host 收口了。
