# 05 Build & Bundle

> v3 插件是一个**标准 npm 包**，打包输出**固定目录** `dist/synra/index.js`。所有 npm 依赖内联进 bundle。

## 1. 包结构

```
@synra-plugin/chat/                   ←  标准 npm 包
├── package.json                      ←  含 synra 字段
├── tsconfig.json
├── eslint.config.js
├── pages/                            ←  ★ Vue 页面（路由级）
│   ├── home/
│   │   └── index.vue                 ←  一个 pageKey 对应一个 Vue SFC
│   ├── settings/
│   │   └── index.vue
│   └── ...
├── src/                              ←  ★ plugin 逻辑（不混 pages）
│   ├── index.ts                      ←  唯一 plugin 入口（definePlugin）
│   ├── lib/                          ←  纯函数 helpers（无 SDK 依赖）
│   │   ├── events.ts
│   │   └── helpers.ts
│   └── types/                        ←  共享类型
│       └── chat.ts
├── icons/
│   └── plugin.svg
├── build.config.ts                   ←  esbuild / tsdown 配置
├── node_modules/                     ←  开发期本地 deps（打包时全 inline）
├── dist/
│   └── synra/
│       ├── index.js                  ←  ★ 固定输出：host 唯一加载的文件
│       ├── index.js.map              ←  可选，prod 关闭
│       └── chunks/                   ←  split chunks（按需）
└── README.md
```

关键：

- **包名**：`@synra-plugin/<id>` 或 `synra-plugin-<id>`；
- **入口**：`dist/synra/index.js`，固定文件；
- **bundle 内联**：vue / 任何 npm 依赖全部 inline 进单文件；
- **`dist/synra/` 固定**：没有 `dist/desktop/`、`dist/mobile/`、`dist/worker/` 之类的变种。所有端跑同一份 bundle；
- **pages/ 与 src/ 分离**：pages/ 是路由概念（一个 pageKey 一个 SFC），src/ 是 plugin 逻辑。`src/index.ts` 通过 `import HomePage from '../pages/home/index.vue'` 引用页面。

### 1.1 src/ 子目录的取舍

| 候选子目录     | 何时用                                       | 何时不要                                  |
| -------------- | -------------------------------------------- | ----------------------------------------- |
| `src/index.ts` | **必有**，唯一入口                           | —                                         |
| `src/lib/`     | 有可复用纯函数（解析、格式化、协议编解码）时 | 函数只在 setup 内一次性用，可直接 inline  |
| `src/types/`   | 跨多个 lib/ 或与外部交换的结构化 payload     | 只有一个 ts 文件，可直接放 `src/index.ts` |

**不推荐**：在 src/ 下再分 `ui / worker / host / shared` 子目录。理由：

1. **ui / worker / host** 是 v2 的 4 runtime 拆分。v3 plugin 一份代码同进程跑，host 内部决定是否升级到 worker——plugin 没有"跑在 worker 的代码"和"跑在 ui 的代码"之分。
2. **shared** 在 v3 里所有 lib 都是 shared（因为只有一个 entry）——这个目录前缀失去语义。
3. **pages/ 在 plugin 根目录**而不是 src/pages/，因为 page 是路由概念（host 的 vue-router 装载），与 plugin 逻辑不同轴。

### 1.2 pages/ 路由化

每个 pageKey 对应 `pages/<pageKey>/index.vue`：

```
pages/
├── home/index.vue            →  ui.registerPage('home', () => import('.../home/index.vue'))
├── settings/index.vue        →  ui.registerPage('settings', () => import('.../settings/index.vue'))
└── widgets/
    └── mini-clock.vue        →  ui.registerPage('mini-clock', () => import('.../widgets/mini-clock.vue'))
```

host 拿到 pageKey 后，按它做 vue-router 动态路由。

### 1.3 一个完整 chat plugin 例子（修正版）

```
@synra-plugin/chat/
├── package.json
├── tsconfig.json
├── eslint.config.js
├── pages/
│   ├── home/index.vue        # 主页（聊天窗口）
│   └── settings/index.vue    # 设置（频道、提示）
├── src/
│   ├── index.ts              # definePlugin({ setup })，注册 pages
│   ├── lib/
│   │   ├── events.ts         # CHAT_TEXT_EVENT 常量
│   │   └── format.ts         # normalizeChannel, buildMessage
│   └── types/
│       └── chat.ts           # ChatMessage / ChatChannel 类型
├── icons/plugin.svg
└── build.config.ts
```

```ts
// src/index.ts
import { definePlugin, type PluginContext } from '@synra/plugin-sdk'
import HomePage from '../pages/home/index.vue'
import SettingsPage from '../pages/settings/index.vue'
import { CHAT_TEXT_EVENT } from './lib/events'

export default definePlugin({
  id: '@synra-plugin/chat',
  version: '1.0.0',
  capabilities: ['ui:registerPage', 'device:send', 'device:receive', 'log:*'],

  async setup(ctx: PluginContext) {
    const { ui, device, log } = ctx

    await ui.registerPage('home', () => HomePage)
    await ui.registerPage('settings', () => SettingsPage)

    device.onMessage(CHAT_TEXT_EVENT, async (msg, from) => {
      log.info('chat received', { from: from.id })
    })
  }
})
```

## 2. package.json

```jsonc
{
  "name": "@synra-plugin/chat",
  "version": "1.0.0",
  "description": "Chat across Synra devices.",
  "type": "module",
  "main": "dist/synra/index.js",
  "module": "dist/synra/index.js",
  "exports": {
    ".": "./dist/synra/index.js"
  },
  "files": ["dist/synra", "README.md", "LICENSE"],
  "scripts": {
    "build": "synra-sdk build",
    "dev": "synra-sdk dev",
    "lint": "eslint .",
    "verify": "synra-sdk verify ."
  },
  "dependencies": {
    "vue": "^3.4.0",
    "pinia": "^2.1.7"
  },
  "peerDependencies": {
    "@synra/plugin-sdk": "^3.0.0"
  },
  "devDependencies": {
    "esbuild": "^0.21.0",
    "vue-tsc": "^2.0.0"
  },
  "synra": {
    "id": "@synra-plugin/chat",
    "version": "1.0.0",
    "title": "Chat",
    "description": "Cross-device chat.",
    "defaultPage": "home",
    "icon": "icons/plugin.svg",
    "minSdkVersion": "3.0.0",
    "preferredSdkVersion": "3.0.0",
    "capabilities": [
      "ui:registerPage",
      "ui:navigate",
      "device:query",
      "device:send",
      "device:receive",
      "log:*"
    ],
    "events": {
      "publish": ["_plugin.chat.*"],
      "subscribe": ["_synra.device.*", "_plugin.*.action.*"]
    },
    "network": {
      "outbound": []
    },
    "hints": [] // 可选：cpu-heavy / ui-heavy / io-heavy
    // ❌ 不再有 entries: { ui, worker, host, shared }
    // ❌ 不再有 kind / runtime / target
  }
}
```

注意：

- **`dependencies` 写常用的**：vue / pinia / 都行；
- **`peerDependencies` 写 `@synra/plugin-sdk`**：host 提供；
- **没有 `kind`、没有 `runtime`、没有 `target`、没有 `isolation`**；
- **`synra.*` 是 host 读的元数据**：包含 capability 声明。

## 3. `synra.*` 字段合约

```text
synra.id                    string, required. 同 package.json#name
synra.version               string, required. 同 package.json#version
synra.title                 string, optional. UI 列表显示名
synra.description           string, optional.
synra.defaultPage           string, optional. 主页 pageKey
synra.icon                  string, optional. 图标路径（相对包根）
synra.minSdkVersion         semver, required. SDK 最低版本
synra.preferredSdkVersion   semver, optional.
synra.capabilities          string[], required. capability 字符串
synra.events.publish        string[], optional. glob list
synra.events.subscribe      string[], optional. glob list
synra.network.outbound      object[], optional.
synra.hints                 string[], optional. 软提示，host 可忽略
synra.compose               string[], optional. 依赖的其它 plugin ids
synra.author                object, optional. {name, email, url}
synra.license               string, optional.
synra.repository            string, optional.
```

> 注：`synra.hints` 不影响 plugin 行为；host 用于决策（auto runtime 策略）。plugin 不该"以为"自己跑在哪个容器。

## 4. 构建工具与配置

**单 build 目标**：`dist/synra/index.js`。没有 desktop / mobile / headless 之类的目标配置。

```ts
// build.config.ts
import { build, context } from 'esbuild'
import vuePlugin from 'esbuild-plugin-vue3'
import { peer } from './peer-deps'

export default {
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  outfile: 'dist/synra/index.js',
  sourcemap: process.env.NODE_ENV !== 'production',
  minify: process.env.NODE_ENV === 'production',
  treeshake: true,
  splitting: true,
  metafile: true,
  external: ['@synra/plugin-sdk'], // 仅这 1 个 externals；其余全部 inline
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false'
  },
  conditions: ['synra', 'import', 'browser', 'default'],
  plugins: [vuePlugin()],
  loader: {
    '.svg': 'dataurl', // 小 SVG 内联
    '.png': 'file' // 大图 → assets/[name]-[hash]
  },
  assetNames: 'assets/[name]-[hash]',
  chunkNames: 'chunks/[name]-[hash]'
}
```

## 5. vue / pinia 等框架被 inline

vue 是 plugin 写的代码里 normal `import { ref } from 'vue'`。Build 时 esbuild 把 vue 打进去。

```ts
// src/index.ts
import { definePlugin } from '@synra/plugin-sdk'
import HomePage from '../pages/home/index.vue' // ← 会一并打进去

export default definePlugin({
  async setup(ctx) {
    await ctx.ui.registerPage('home', () => HomePage)
    // ...
  }
})
```

> 关键：**页面文件 `pages/home/index.vue` 在 plugin 根目录**，不在 `src/`。`src/index.ts` 唯一入口，用 `../pages/...` 引用。

**Plugin 作者可以正常写 `import 'vue'` / `import 'vue-router'` / `import 'pinia'`**——因为 build 把它们打进 bundle。

这是 v3 与 v2/早期 v3 的关键区别：**plugin 可以用任何 npm 依赖**——只要它们在 esbuild 的 `platform: 'browser'` 下能跑得通且不依赖 native node modules。

## 6. 不允许 native node 内置

esbuild `platform: 'browser'` 会主动排除 node 内置（`fs/path/child_process` 等）。如 plugin 真的需要 Node 内置（极其少见），把代码拆在 process runtime 跑的 plugin 里——写 `ctx.fs.write(...)` 替代 `import 'fs'`。

宿主安装这种 plugin 时会**拒绝**：

```
PluginError: <plugin> imports node builtin "fs" (path: src/server.ts).
Use ctx.fs.write instead. Plugin rejected.
```

## 7. Lint 规则（dev fail-fast）

`synra-sdk/lint` 暴露 3 条规则：

| 规则                             | 作用                                   |
| -------------------------------- | -------------------------------------- |
| `synra/no-undeclared-capability` | 拦截未声明 cap 的 SDK 调用             |
| `synra/capability-shape`         | 校验 capability 字符串 syntax          |
| `synra/no-node-builtins`         | 拒绝 `import 'node:fs'` 等 native 内置 |

```ts
// eslint.config.js
import synraLint from '@synra/plugin-sdk/lint'
export default [
  ...synraLint.configs.recommended,
  {
    rules: {
      'synra/no-node-builtins': 'error'
    }
  }
]
```

## 8. Capability-shape 校验

字符串必须符合正则（lint rule 实现）：

```ts
// valid
'ui:registerPage'
'device:send:@synra-pc' // qualifier = device id
'network:fetch:api.github.com'
'network:fetch:api.example.com:POST' // qualifier = HTTP method
'fs:read:/sandbox/chat/**' // qualifier = path glob
'log:*'
'event:emit:_plugin.*'
'device:invokeAction' // 命中组合 cap

// invalid
'registerPage' // 缺 domain
'ui:' // 空 method
'ui::navigate' // 空 resource
'*' // 仅通配不允许
'foo:bar baz' // 含空白
'foo:bar:host test' // qualifier 含特殊字符

// 不允许出现在 plugin 元数据：
'kind:desktop' // host 内部
'runtime:web' // host 内部
'isolation:worker' // 不存在
```

## 9. 构建脚本

```jsonc
{
  "scripts": {
    "build": "synra-sdk build",
    "dev": "synra-sdk dev",
    "lint": "eslint .",
    "verify": "synra-sdk verify",
    "prepublishOnly": "synra-sdk verify && synra build"
  }
}
```

`synra-sdk build` 内部：

1. esbuild → `dist/synra/index.js`
2. synra-sdk verify（lint + capability-shape + bundle 合法性）
3. synra-sdk sign（生成 `.sig`，可选）

## 10. Bundle 验证（publish 必跑）

```bash
synra-sdk verify .
```

| 项  | 检查                                                      |
| --- | --------------------------------------------------------- |
| 1   | `dist/synra/index.js` 存在                                |
| 2   | ESM 合法（含 `export default`）                           |
| 3   | 默认导出是合法 `PluginDef`（含 `setup` 或 `id` 等）       |
| 4   | bundle ≤ 5 MB                                             |
| 5   | capability 字符串全部合法                                 |
| 6   | 不出现 node 内置（`fs / path / child_process` 等）        |
| 7   | 仅 externals = `@synra/plugin-sdk` 一个                   |
| 8   | `synra.capabilities` 与 `synra.events.*` 在 bundle 内一致 |

## 11. 性能目标

| Bundle 大小 | 加载耗时（cached） | 加载耗时（cold） |
| ----------- | ------------------ | ---------------- |
| 50 KB       | < 5ms              | ~50ms            |
| 200 KB      | < 8ms              | ~150ms           |
| 1 MB        | < 15ms             | ~500ms           |
| 5 MB        | < 50ms             | ~2s              |

esbuild build：< 200ms（warm）。

## 12. 与 v2 对比

| 维度           | v2                                                      | v3（npm 包 + 固定 dist/synra）                    |
| -------------- | ------------------------------------------------------- | ------------------------------------------------- |
| 包发布         | npm tarball                                             | **npm tarball**                                   |
| `dependencies` | 必须为空                                                | **正常 npm deps**（vue, pinia 都可以）            |
| 目录结构       | `src/{ui,worker,host,shared}` 4 entry                   | **`src/{index,lib,types}` 单 entry** + `pages/`   |
| Build output   | `dist/ui/index.mjs` + `dist/host/index.mjs`（多 entry） | `dist/synra/index.js`（单 entry）                 |
| Build 变种     | `entries.ui / entries.host` 分开                        | **不变种**；一文件跑所有端                        |
| Externals      | `vue` + `sdk`                                           | **`sdk` only**（vue 也可以 inline，由 plugin 选） |
| 移动端         | 双 runtime                                              | **同文件、同 runtime**                            |

下一节：[06-install-and-load.md](./06-install-and-load.md) — npm 安装 + 多端自动同步。
