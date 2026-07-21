# 06 Install & Load & Auto-Sync（npm 安装 + 多端自动同步）

> v3 关键修订：**plugin 是 npm 包，host 在运行时按需拉取、安装；用户在桌面装一个插件，自动推到所有连接的端（web / mobile）。**

## 1. 三种 source

```ts
// InstallSource
export type InstallSource =
  | { kind: 'npm'; package: string; version: string } // '@synra-plugin/chat' or 'synra-plugin-notes'
  | { kind: 'git'; url: string; ref?: string } // git@... or https://...
  | { kind: 'url'; url: string } // 直接 tarball URL
  | { kind: 'local'; path: string } // 本地目录（开发态）
```

> npm 之外，"等源"包括 git、URL、本地路径。所有 source 在 host 内走统一接口 `resolve(source) -> { tarball, signature? }`。

### 1.1 npm 安装

```ts
// host sync: 用户在 *Plugins* 写 "@synra-plugin/chat"，回车
await window.synraApi.plugins.install({
  kind: 'npm',
  package: '@synra-plugin/chat',
  version: 'latest'
})
```

### 1.2 git 安装

```ts
await window.synraApi.plugins.install({
  kind: 'git',
  url: 'git@github.com:synra/plugin-chat-experimental.git',
  ref: 'feat/widgets'
})
```

### 1.3 URL 安装

```ts
await window.synraApi.plugins.install({
  kind: 'url',
  url: 'https://cdn.example.com/plugins/chat-1.0.0.tgz'
})
```

### 1.4 本地（开发态）

```ts
await window.synraApi.plugins.install({
  kind: 'local',
  path: '/Users/me/dev/chat-plugin'
})
```

## 2. 安装全流程

```text
1. user: 写 source → click "Install"
2. resolve: host 调用对应 source resolver
   - npm: 走 registry (e.g., npmjs.com) → metadata → tarball URL
   - git: git clone + 读 package.json
   - url: 直接下
   - local: 直接读
3. download: tarball 落到 <cache>/<source-key>/
4. extract: 解压到 <AppData>/synra/plugins/<pluginId>/<version>/package/
5. install-deps (可选): 内嵌 pnpm install --prod（如果 plugin 有 native deps）
6. build: 调 `pnpm run build` 或 `synra-sdk build`
   → 生成 dist/synra/index.js
7. verify:
   - sig 校验（如果有）
   - bundle 完整性
   - capability shape
   - 没有 node 内置
8. registry.register: 写入 plugin registry
9. broadcast: 跨端自动同步（mobile / web 收到 `_synra.plugin.installed`）
```

## 3. 状态机

```text
                   install source
                       ↓
                ┌── resolving ──┐          失败 → install-rejected
                │ ↓            │
                │ resolved ────┴── building ─── failed → build-error
                │ ↓                              （可重试）
                │ built ──── verifying ──── verified
                │            ↓
                │        registered (未启用)
                │            ↓
                │     enable (load + setup)
                │            ↓
                │        active
                │            ↓
                │     disable (teardown)
                │            ↓
                │        registered
                │
                └── errored --（重试或 uninstall）
```

| 状态         | 含义                                          |
| ------------ | --------------------------------------------- |
| `resolving`  | 解析 source（registry query / clone / fetch） |
| `building`   | pnpm install + bundle build                   |
| `verifying`  | sig + capability + bundle sanity              |
| `registered` | 已写入 registry，未启用                       |
| `active`     | bundle 已加载，setup() 已调用                 |
| `errored`    | 任意阶段失败                                  |

## 4. 安装 API

### 4.1 调用方

```ts
// apps/web/src/lib/synra-api.ts (capability gated)
const plugins = window.synraApi.plugins
await plugins.install({ kind: 'npm', package: '@synra-plugin/chat', version: '1.0.0' })
await plugins.uninstall('@synra-plugin/chat')
await plugins.enable('@synra-plugin/chat')
await plugins.disable('@synra-plugin/chat')
await plugins.list()
await plugins.get('@synra-plugin/chat')
```

### 4.2 主进程（Electron / Web）

```ts
// apps/electron/src/main/plugins/install.ts
ipcMain.handle('synra:plugins:install', async (_, source: InstallSource) => {
  return pluginInstaller.install(source)
})
```

### 4.3 npm resolver 详情

```ts
// @synra/plugin-sdk/install/npm-source.ts
export async function resolveNpm(source: {
  kind: 'npm'
  package: string
  version: string
}): Promise<ResolvedBundle> {
  const meta = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(source.package)}/${encodeURIComponent(source.version)}`
  )
  const { dist } = await meta.json()
  const tarball = await fetchTarball(dist.tarball)
  return { tarball, signature: null, manifest: meta.package }
}
```

> v3 不绑定 npmjs.com；host 可配置其他 registry（yarn / verdaccio / 自建）。

### 4.4 git resolver

```ts
// @synra/plugin-sdk/install/git-source.ts
export async function resolveGit(source: {
  kind: 'git'
  url: string
  ref?: string
}): Promise<ResolvedBundle> {
  const { execFile } = await import('node:child_process') // 仅 host 内部
  await execFile('git', ['clone', '--depth=1', source.url, tmpDir])
  if (source.ref) await execFile('git', ['checkout', source.ref], { cwd: tmpDir })
  const pkg = JSON.parse(await fs.readFile(`${tmpDir}/package.json`, 'utf8'))
  return await tarFromDir(tmpDir, pkg)
}
```

> `git` 这个 resolver 只在 host（Electron main / Node-side）跑；plugin 自己不接触。

## 5. 多端自动同步（Auto-Sync）

> 用户在桌面装一个插件 → 自动推到 mobile / web。不需要手动点 _Sync from desktop_。

### 5.1 触发链

```text
desktop install plugin (host A)
   ↓ write registry
   ↓ resolve + build → bundle ready
   ↓ write dist/synra/index.js to local fs
   ↓
   ┌── emit _synra.plugin.installed { id, version, hash }  │
   ↓                                                       │
   LAN discovery: 谁连接了？                               │
   ↓                                                       │
listening on: mobile (host B)                              │
   ↓                                                       │
   mobile 收到 _synra.plugin.installed                     │
   ↓                                                       │
   是否 autoSync=true？                                    │
   ├─ true → fetch dist/synra/index.js from desktop        │
   │         (经 file.transfer.* + peer-to-peer)           │
   │         → write to mobile <pluginId>/<version>/        │
   │         → verify sig                                  │
   │         → register mobile local                       │
   │         → enable if user opt-in                       │
   └─ false → record in mobile sync queue                 │
              → user 在 *Plugins* 里手动 *Sync* 按钮拉
```

### 5.2 Sync 协议

在 `file.transfer.*` 之上：

```ts
// ① 安装同步请求
device.send('@synra-mobile', {
  event: '_synra.plugin.installed',
  payload: {
    pluginId: '@synra-plugin/chat',
    version: '1.0.0',
    bundleHash: 'sha256:...',
    bundleSize: 123456,
    sourceUrl: 'synra://plugin/@synra-plugin/chat/1.0.0/bundle', // 用 file.transfer.* 取
    signature: 'base64-of-ed25519-sig',
    manifest: {/* synra.* 字段 */}
  }
})

// ② mobile 经 file.transfer.request 拉 bundle
fileTransfer.request('synra://plugin/@synra-plugin/chat/1.0.0/bundle')

// ③ 校验签名、写盘、注册

// ④ 同步结果回桌面（成功 / 失败）
device.send('@synra-pc', {
  event: '_synra.plugin.sync.result',
  payload: { pluginId, version, ok: true, atHost: '@synra-mobile' }
})
```

### 5.3 配置

```jsonc
{
  "autoSync": {
    "desktopToMobile": true, // default
    "mobileToDesktop": false, // mobile 不主动回推
    "strategy": "auto", // auto | manual | ask-each-time
    "mirrorRegistry": "https://cdn.example.org" // 备用源（LAN 失败时降级用）
  }
}
```

`strategy: 'manual'`：不自动推；用户在 mobile 上点 _Sync_ 拉。`ask-each-time`：desktop 弹窗问。

### 5.4 跨端冲突解决

冲突场景：desktop 是 1.0.0，mobile 是 1.1.0（不同步前装的）。

解决策略：

- `desktop-wins`（默认）：mobile 卸载旧的，装桌面的版本；
- `mobile-keeps`：mobile 保留旧的，桌面装为并存；
- `manual`：在 mobile 上 _Plugins_ 页面弹"是否接受 1.0.0？"

> 默认策略：`desktop-wins` 因为 desktop 是 single source of truth。

## 6. 加载（Load）

```ts
// apps/web/src/plugins/loader.ts
import { createSynraSDK } from '@synra/plugin-sdk'
import { registry } from './registry'

export async function enablePlugin(pluginId: string): Promise<PluginInstance> {
  const entry = registry.get(pluginId)
  if (!entry) throw new Error(`plugin ${pluginId} not registered`)
  if (entry.instance) return entry.instance

  // 1. compose 检查
  if (entry.manifest.compose) {
    for (const depId of entry.manifest.compose) {
      const dep = registry.get(depId)
      if (!dep?.instance) await enablePlugin(depId)
    }
  }

  // 2. host 决定 runtime
  const runtime = await runtimeAllocator.allocate(entry.manifest, hostEnv)
  const bridge = createBridgeFor(runtime, registry)

  // 3. load bundle
  const module = await loadBundle(entry.manifest.main)

  // 4. host 调 createSynraSDK
  const sdk = createSynraSDK({
    pluginId: entry.manifest.id,
    runtime: runtime.kind,
    capabilities: entry.manifest.capabilities,
    bridge,
    registry
  })

  // 5. plugin 的 setup 跑
  try {
    const teardown = await module.default.setup(sdk)
    entry.instance = {
      module,
      sdk,
      runtime,
      teardown: typeof teardown === 'function' ? teardown : async () => sdk.dispose()
    }
    return entry.instance
  } catch (e) {
    throw new PluginSetupError(entry.manifest.id, e)
  }
}
```

## 7. 缓存策略

```ts
const bundleCache = new LRUCache<string, ModuleType>({ max: 200 })

export async function loadBundle(bundleUrl: string): Promise<ModuleType> {
  const key = `${bundleUrl}`
  if (bundleCache.has(key)) return bundleCache.get(key)!
  const module = await import(/* @vite-ignore */ bundleUrl)
  bundleCache.set(key, module)
  return module
}
```

> 开发态用 `?t=<timestamp>` 强制刷新。

## 8. Teardown / Disable

```ts
export async function disablePlugin(pluginId: string): Promise<void> {
  const entry = registry.get(pluginId)
  if (!entry?.instance) return
  await entry.instance.teardown()
  entry.instance = undefined
}
```

registry 的 `cascade: true` 行为：

- 本 plugin disabled → 所有把它作 compose 的 plugin 也 disabled（带 5s 缓冲可撤销）。

## 9. 热重载（dev）

```ts
// apps/web/src/plugins/hot-reload.ts
const ws = new WebSocket('ws://localhost:24678')
ws.addEventListener('message', async (e) => {
  const msg = JSON.parse(e.data)
  if (msg.kind === 'bundle-updated') {
    bundleCache.delete(msg.url)
    if (registry.get(msg.pluginId)?.instance) {
      await disablePlugin(msg.pluginId)
      await enablePlugin(msg.pluginId)
    }
  }
})
```

`synra-sdk dev` 内部跑 esbuild `--watch`，build 完成时给所有 connected host 推 ws 消息。

## 10. 错误处理

```ts
class PluginError extends Error {
  constructor(
    public readonly stage: 'resolve' | 'build' | 'verify' | 'load' | 'setup',
    public readonly pluginId: string,
    cause?: Error
  ) {
    super(`Plugin ${pluginId} failed at ${stage}: ${cause?.message ?? ''}`)
  }
}
```

UI 在 _Plugins_ 详情页展示错误 + 重试按钮：

```vue
<PluginErrorCard
  :plugin="plugin"
  :error="plugin.error"
  @retry="pluginsApi.install(plugin.source)"
/>
```

## 11. npm 私有 registry

```jsonc
{
  "registryMirrors": {
    "default": "https://registry.npmjs.org",
    "overrides": {
      "@synra-plugin/*": "https://npm.pkg.github.com/@synra-owner",
      "*": "https://registry.npmmirror.com"
    }
  }
}
```

优先级：overrides 中的精确 > overrides 中的通配 > default。

## 12. 与 v2 对比

| 维度       | v2                            | v3                                  |
| ---------- | ----------------------------- | ----------------------------------- |
| 安装源     | npm tarball 手动同步到 mobile | **npm/git/URL 同等** + **自动同步** |
| 多端同步   | 用户手动 _Sync from desktop_  | **自动**（user 不点）               |
| 状态       | 多套                          | 6 个清晰状态                        |
| Compose    | ❌                            | ✅ Composite 模式                   |
| 失败重试   | 一次性                        | 每阶段独立可重试                    |
| 自动解冲突 | ❌                            | ✅ `desktop-wins` / 等              |

## 13. 关键原则

> **Plugin 是 npm 包；host 在运行时按需拉取；装一次，自动同步到所有端。**
>
> Plugin 不选 host；plugin 不写 runtime 枚举。

下一节：[07-cross-platform-and-perf.md](./07-cross-platform-and-perf.md)。
