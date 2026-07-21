# Synra 项目开发进度梳理（v3 · 单 Runtime + Capability Proxy + npm 安装）

> 整理日期：2026-07-19（v3 激进重写，文档侧完成）
> 修订日期：2026-07-20（npm 安装模型 + createSynraSDK 命名 + 固定打包目录 + 隔离由 host 决定）
> 修订日期：2026-07-21（Capacitor Android 链路修复 + 文档归档收敛）
> 范围：`ai-docs/` 全部设计文档 + 当前仓库实现快照（`apps/*`、`packages/*`）。
> 本文件用于整体对齐项目进展与待攻克项，详细方案见各专题文档。

## 重大版本变化

| 版本   | 模型                                    | 隔离                                  | 目录                                   | Bundle                            | 安装                              | 多端             |
| ------ | --------------------------------------- | ------------------------------------- | -------------------------------------- | --------------------------------- | --------------------------------- | ---------------- |
| v1     | npm 包 + 多 entry                       | iframe / Worker / utilityProcess 默认 | `src/{ui,worker,host,shared}`          | ui.bundle + host.bundle + shared  | tarball 手动同步                  | 手动             |
| v2     | SDK 优先 + 静态 capability              | 仍 4 runtime                          | `src/{ui,worker,host,shared}`          | ui.bundle + host.bundle           | tarball 手动同步                  | 手动 _Sync_ 按钮 |
| **v3** | **SDK + capability Proxy + 单 runtime** | **host 决定**（plugin 不写）          | **`pages/` + `src/{index,lib,types}`** | **dist/synra/index.js 单 bundle** | **host 运行时按需拉 npm/git/URL** | **自动同步**     |

**v3 激进点（2026-07-20 修订版）**：

- 取消 4 runtime（iframe / Worker / utilityProcess 不再默认启用）；
- 取消 postMessage bridge，plugin 与 host 同进程（host 内部决定是否升级到 worker / process）；
- 取消 `entries.{ui,host}` 双 bundle，统一为 `dist/synra/index.js`；
- **取消 src 下 4 entry 拆分**（`ui/worker/host/shared`）——plugin 不再按 runtime 分目录；统一为 `src/{index,lib,types}` + 根目录 `pages/`；
- **取消 plugin 自由度的 isolation / runtime / kind 字段**——host 内部决策；
- **取消 plugin bundle 在 host 写死的限制**：npm 依赖（vue / pinia 等）由 esbuild 内联进 bundle；
- **取消 v2 的"mobile-plugin-runtime"独立概念**（移动 = 桌面 host = web）；
- 显式采用 13+ 个设计模式作为骨架（Proxy / Adapter / Mediator / Composite / Registry / Strategy / Lazy Proxy / Decorator / Observer / Builder / Chain of Responsibility / Facade / Template Method / Memento / Null Object）；
- **创建函数名 `createSynraSDK` 不 rename**；
- **运行时按需从 npm / git / URL 拉取**，装一次自动同步到所有端。

详细见 [plugin-system/README.md](./plugin-system/README.md) §"设计动机"。

## 1. 项目定位（来自 `ai-docs/main/`）

Synra 是一个**跨设备动作编排框架**，分 PC 端与移动端：

- 任意节点既能发现、也能被其他节点发现；能邀请、也能被邀请（双向对称）。
- 集群采用**单主机中继模型**：业务消息必须经主机转发，插件清单与权威配置由主机唯一提供。
- 角色（sender / receiver）按会话赋予，**不**与设备类型绑定。
- 核心场景：手机分享 → PC 执行；PC 触发 → 手机执行；插件双向流转。

## 2. 已完成子系统

### 2.1 前端应用壳与产品页（apps/frontend）

**文档**：`ai-docs/frontend/`。

**实现快照**：

- `pages/{home,plugins,devices,settings}` 四页结构落地，`pages/xxx/index.vue` 命名。
- UnoCSS 主题 + 语义色槽位。
- `AppShellLayout + SidebarNav + SidebarItem` 壳层，断点 `base~md` 抽屉 / `lg+` 固定侧栏。
- `PluginCard / PluginCardGrid / PluginSearchBar`。
- 自动导入：vue / vue-router / pinia / composables。
- Pinia stores：`app-shell` / `lan-discovery` / `pairing` / `paired-reconnect`。
- 主 composables：`use-plugin-catalog`、`use-plugin-sync`、`use-connect-page`、`use-pairing-protocol-context`、`use-device-basic-info`、`use-paired-auto-connect`。

**v3 影响**：UI 部分**无破坏性变更**——`pages/plugins` 页面将按 [plugin-system/06-install-and-load.md](./plugin-system/06-install-and-load.md) 接入新的 npm/git/URL 安装流程与自动同步。

### 2.2 跨端通讯底层

**文档**：`ai-docs/cross-platform-communication-map/`、`communication-use-event-refactor/`。

**实现快照**：

- **`@synra/protocol`**：`event-names.ts` / `lan-events.ts` / `file-transfer.ts` / `discovery-timing.ts` 已落地。
- **`@synra/envelope`**：`message-envelope.ts` / `event-prefix.ts`（`_synra.` / `_plugin.{slug}.` 前缀规则） / `resolve-post-transport.ts` / `envelope-surface.ts` / `electron-main-process.ts`。
- **`@synra/hooks`**：三层 envelope、`runtime/` 子模块、`useFileTransfer`、`electron.ts`、公开导出已收敛。
- **`@synra/capacitor-electron`**：`bridge/preload`、`bridge/main` 单一 invoke 入口 + channel 白名单；`host/services/device-discovery`；`shared/*`；`plugin` 子路径导出 `ElectronBridgePlugin`。
- **`@synra/capacitor-device-connection`** / **`capacitor-lan-discovery`** / **`capacitor-preferences`** 三端实现齐备。
- **`@synra/transport-core` / `transport-events`** 已纳入。

**v3 影响**：底层**完全重用**。v3 SDK 内部对 plugin 暴露的 `ctx.event.emit/subscribe` 走 envelope；`ctx.device.send` 走 `DeviceConnection.sendMessage`。SDK 不重新发明传输。

### 2.3 设备集群

**实现快照**：扫描 / 握手 / 邀请流程已落；点对点 TCP + UDP（mDNS）；`mergePairedAndDiscoveredDevices`；连接层信封白名单。

**未落地**：单主机中继、选主、`PluginCatalogAuthority`（暂以"PC 即主机"简化模型）、`relay.request` / `host.announce` 事件族。

**v3 影响**：与插件系统解耦——plugin 不感知集群模型，只感知 `device.list()` 与 `device.send(target, ...)`。

### 2.4 跨设备文件传输

**实现快照**：`@synra/protocol/file-transfer.ts` + `PluginBundleTransferAssembly` + `iteratePluginBundleChunks` + 移动端 `persistInboundPluginBundleFromTgzBuffer` 落盘到 `Directory.Data/synra/plugins/<id>/<version>/`。

**v3 影响**：传输层**完全重用**，但用途变了：

- v1/v2：传输 `tgz`（npm 完整包）→ 移动端解压 → 跑；
- v3：传输单 bundle（`dist/synra/index.js` + `.sig`）→ 移动端验签 → 直接 import。

详见 [plugin-system/06-install-and-load.md §5](./plugin-system/06-install-and-load.md)。

### 2.5 插件系统（v3 · SDK Proxy 模型）

**文档**：[`plugin-system/`](./plugin-system/)（README + 8 篇）；详见 [plugin-system/README.md](./plugin-system/README.md)。

**v3 核心改动（对比 v1 / v2）**：

| 维度            | v1 → v2 → v3                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| Plugin 入口     | 旧 `Plugin` 类 → v2 `definePlugin({...})` → v3 **同样 `definePlugin({...})`**                          |
| Bundle 输出     | 2 → 2 → **1**（`dist/synra/index.js`）                                                                 |
| Runtime         | 1 → 4 → **由 host 决定；plugin 不写**                                                                  |
| Capability 校验 | 启动时 → 启动时 + lint → **每次调用 Proxy + lint + bundle verify**                                     |
| 安装源          | tarball 手动 → tarball 手动 → **npm / git / URL 运行时按需拉取**                                       |
| 多端同步        | 手动 → 手动按钮 → **自动**                                                                             |
| npm 依赖        | 限制 → 限制 → **esbuild 内联进 bundle**（vue / pinia 都行）                                            |
| 工厂名          | `createSynraSDK` → `createSynraSDK` → **`createSynraSDK`**（不 rename）                                |
| plugin 隔离字段 | `entries.{ui,host}` → `entries.{ui,host}` → **无**                                                     |
| plugin 目录     | `src/{ui,worker,host,shared}` → `src/{ui,worker,host,shared}` → **`pages/` + `src/{index,lib,types}`** |

**v3 实现路径**（按 [plugin-system/README.md §"代码示例"](./plugin-system/README.md)）：

```ts
// plugin 作者写一份代码（标准 npm 包）：
import { definePlugin } from '@synra/plugin-sdk'
import HomePage from './HomePage.vue'

export default definePlugin({
  id: '@synra-plugin/chat',
  capabilities: ['ui:registerPage', 'device:send', 'device:receive', 'log:*'],
  async setup(ctx) {
    /* ... */
  }
})

// Host 在 web / electron / mobile 三处用同一份 SDK 工厂：
const sdk = createSynraSDK({
  pluginId,
  runtime, // runtime 由 host 内部决定
  capabilities,
  bridge, // 由 host 选 main / worker / process
  registry
})
await module.default.setup(sdk)
```

**v3 实现现状（截至 2026-07-21）**：

| 模块                                                                         | 状态                                                                              | 落地位置                                                                                                                                              |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@synra/plugin-sdk` 包骨架                                                   | **已落地**（v0.1.0）                                                              | `packages/plugin-sdk/`                                                                                                                                |
| `createSynraSDK` 工厂 + Lazy Proxy                                           | **部分落地**（types-only SDK，plugin 端零运行时依赖已落地；9 namespace 尚在收敛） | `packages/plugin-sdk/src/core/sdk.ts`                                                                                                                 |
| `capabilityProxy` Proxy 实现（含 glob match）                                | **已落地**（types-only 实现）                                                     | `packages/plugin-sdk/src/runtime/capability-proxy.ts`                                                                                                 |
| `synra/no-undeclared-capability` 等 lint rules                               | **未落地**（M0）                                                                  | —                                                                                                                                                     |
| 9 个 namespace 实现（env/log/event/ui/device/storage/action/network/fs）     | **部分落地**（ui / event / device 已通；其余 stub）                               | `packages/plugin-sdk/src/core/sdk.ts` + 子模块                                                                                                        |
| Bridge 适配 3 种 runtime（main / worker / process）                          | **未落地**（M1，单 runtime 已够用）                                               | —                                                                                                                                                     |
| `apps/frontend/src/plugins/host/` 的 PluginRouteBinder / LifecycleManager    | **已落地**                                                                        | `apps/frontend/src/plugins/host/`                                                                                                                     |
| host 决定 runtime（plugin 不写 kind/runtime/isolation）                      | **已落地**                                                                        | `plugin-system/01-runtime-and-isolation.md`                                                                                                           |
| tsdown 单一 bundle 构建（`dist/synra/index.js`）                             | **已落地**（`defineSynraPluginViteConfig`）                                       | `packages/plugin-sdk/src/vite/index.ts`                                                                                                               |
| host vendor-vue chunk + `<script type="importmap">`                          | **已落地**                                                                        | `apps/frontend/vite.config.ts`（`synraVueVendorChunk` + `synraVueImportmap`）                                                                         |
| `dist/ui/index.mjs` → `dist/synra/index.js`（v2→v3 路径切换）                | **已落地**                                                                        | `plugin-route-binder.ts#resolvePageModuleCandidates`                                                                                                  |
| Capacitor Android 上 plugin bundle 加载链路（fetch + importmap 重写 + Blob） | **已落地**（hello MVP 已验证）                                                    | `plugin-route-binder.ts#importPluginBundleContentWithImportMap` + [plugin-system/09](../plugin-system/09-host-vue-importmap-and-capacitor-android.md) |
| npm 安装源解析（白名单 registryUrl）                                         | **已落地**                                                                        | `apps/frontend/src/plugins/host/`                                                                                                                     |
| git / URL 安装源解析                                                         | **未落地**（M2）                                                                  | —                                                                                                                                                     |
| 多端自动同步（`_synra.plugin.installed` + `file.transfer.*`）                | **已落地**（file.transfer 主链路通）                                              | `file-transfer/` + `apps/frontend`                                                                                                                    |
| `synra-sdk` CLI（build / verify / sign / publish / dev）                     | **未落地**（M3）                                                                  | —                                                                                                                                                     |
| LRU bundle cache + 热重载（dev WS）                                          | **未落地**（M3）                                                                  | —                                                                                                                                                     |
| Compose / Cascade（DAG 启用）                                                | **未落地**（M4）                                                                  | —                                                                                                                                                     |
| Bench 套件（mitata）：capability proxy vs postMessage 对比                   | **未落地**（M5）                                                                  | —                                                                                                                                                     |
| 电子签名（ed25519 sign / verify）                                            | **未落地**（M6）                                                                  | —                                                                                                                                                     |

**v1 / v2 实现存量（按 v3 进度替代）**：

| 旧实现                                                                    | v3 替代                                                                    |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `apps/frontend/src/plugins/host/plugin-host-facade.ts`                    | `apps/web/src/plugins/registry.ts`                                         |
| `host/plugin-asset-url.ts`                                                | 不需要（在 host 内存中直接 import）                                        |
| `host/plugin-registry.ts`                                                 | 重写为 `PluginRegistry` 类                                                 |
| `host/plugin-route-binder.ts`                                             | 由 v3 的 `ui.registerPage` 直接驱动 vue-router                             |
| `host/plugin-lifecycle-manager.ts`                                        | 由 `loader.ts` 接管                                                        |
| `host/plugin-worker-capabilities.ts`                                      | 由 capability Proxy 替代                                                   |
| `bridge/capacitor-plugin-host.ts#persistInboundPluginBundleFromTgzBuffer` | 重写：v3 安装是 npm tarball → build → 落 `dist/synra/index.js`             |
| `bridge/synra-plugin-host-bridge.ts`                                      | 重写为 `createElectronBridge` / `createMainBridge`                         |
| `packages/plugin-system/naming.ts`                                        | 保留（plugin id 规则不变）                                                 |
| `packages/plugin-system/manifest.ts`                                      | 重写为 v3 schema：`{ id, version, capabilities, events, network, hints? }` |
| `packages/plugin-system/catalog.ts`                                       | 重写为 v3 catalog：`{ id, version, source: npm/git/url, bundleHash }`      |
| `packages/plugin-system/resolve-ui-entry.ts`                              | 删除（不再有 ui entry 概念）                                               |
| `packages/plugin-system/browser/tgz-extract.ts`                           | 删除（v3 由 host 端 esbuild 出 `dist/synra/index.js`）                     |
| `packages/plugin-system/install-store.ts`                                 | 重写为 v3 store（plugin 列表 + versions + 安装源类型）                     |
| `packages/plugin-sdk/`                                                    | 删除（合并到 `@synra/plugin-sdk` 重写）                                    |
| `apps/mobile/plugins/index.ts`                                            | 重写：仅 sync 入口，无各自 runtime                                         |

### 2.6 移动端（apps/mobile / Capacitor）

**文档**：`ai-docs/capacitor-implementation/`。

**实现快照**：`apps/mobile` 已有 `android/` + `ios/App/`，`capacitor.config.ts`：`appId: com.synra.app / appName: Synra / webDir: www`。`apps/mobile/www` 由 `apps/frontend/dist` 同步。已能接收 plugin 包（§2.4 v1 路径）。

**v3 影响**：

- 移动端 plugin 加载路径等于 web（同一 Vue SPA + 同一 SDK 工厂）；
- `apps/mobile` 只是 web 的 Capacitor 容器，不再有 plugin-related 独立代码；
- 多端同步是**自动**的——desktop install → LAN 上的 mobile 自动收到 `_synra.plugin.installed` 事件 → 经 `file.transfer.*` 拉 bundle → 验签 → 注册。

## 3. 整体架构图（v3 目标态）

```text
apps/
  web (Vue + Vite)                     = apps/electron renderer = apps/mobile webview
    ├─ pages/{home,plugins,devices,settings}/index.vue
    ├─ components/{base,layout,plugins,...}/
    ├─ stores/...
    ├─ plugins/                         # v3 host 端
    │   ├─ registry.ts                  # PluginRegistry (Registry 模式)
    │   ├─ runtime-allocator.ts         # ★ host 决定 main / worker / process
    │   ├─ loader.ts                    # 加载 + 调 createSynraSDK
    │   ├─ bridges/{main,worker,process}.ts
    │   ├─ install/
    │   │   ├─ npm-source.ts            # npm registry 解析
    │   │   ├─ git-source.ts            # git clone + tar
    │   │   ├─ url-source.ts            # 公开 tarball URL
    │   │   ├─ local-source.ts          # dev 路径
    │   │   └─ installer.ts             # 状态机：resolve → build → verify → register
    │   ├─ sync/
    │   │   ├─ broadcast-installed.ts   # 发出 _synra.plugin.installed
    │   │   └─ receive-sync.ts          # 接收并 install
    │   ├─ host-bridge.ts               # createElectronBridge 等
    │   ├─ hot-reload.ts                # dev WS 热重载
    │   ├─ marketplace.ts               # *Plugins* 页面 data layer
    │   └─ lifecycle.ts                 # enable/disable state machine
    └─ router/

  electron (Electron + Vue)
    └─ src/{main,preload,bridge}/       # main 进程 + utilityProcess 启动器（按需）

  mobile (Capacitor)
    ├─ android/ (Java)
    └─ ios/App/ (Swift)
    注意：mobile 内部没有独立 plugin 运行时——只是 web SPA 的容器

packages/
  protocol/             # LanWireEventName / FileTransfer*
  envelope/             # event-prefix / message-envelope
  hooks/                # useSynraEnvelope* / useFileTransfer / runtime/
  capacitor-electron/   # Electron 桥 + host services
  capacitor-device-connection/  # Android/iOS TCP
  capacitor-lan-discovery/      # Android/iOS UDP/mDNS
  capacitor-preferences/        # Android/iOS kv
  transport-core, transport-events
  plugin-sdk/           # ★ v3 @synra/plugin-sdk（types + createSynraSDK + capability proxy + lint + cli + bridges + install/*）
  utils/
```

## 4. 关键文档 ↔ 实现 对应表（v3）

| 文档章节                                                         | 关键产物                                                                    | 实现位置（命中 / 待落地）                                                                                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **plugin-system/README.md**                                      | v3 模型总览 + 关键约束速查                                                  | 设计规范                                                                                                                                       |
| **plugin-system/00-plugin-runtime-model.md**                     | plugin-sdk types-only + PluginBridge 注入模型 + 半成品收敛事实清单          | `packages/plugin-sdk/src/core/sdk.ts` + `apps/frontend/src/plugins/host/`                                                                      |
| **plugin-system/01-runtime-and-isolation.md**                    | host 决定 runtime（plugin 不写）                                            | `apps/frontend/src/plugins/host/`（运行时不开 4 runtime，等价于"host 决定"）                                                                   |
| **plugin-system/02-capability-gate.md**                          | Proxy + capability 字符串语法 + 错误模型                                    | `packages/plugin-sdk/src/runtime/capability-proxy.ts`                                                                                          |
| **plugin-system/03-sdk-surface.md**                              | 9 namespace + Lazy Proxy + createSynraSDK 工厂                              | `packages/plugin-sdk/src/core/sdk.ts`                                                                                                          |
| **plugin-system/04-design-patterns.md**                          | 13+ 模式总览                                                                | 见各模块顶头注释引用                                                                                                                           |
| **plugin-system/05-build-and-bundle.md**                         | 单一 bundle（`dist/synra/index.js`）+ npm deps 内联 + lint rules            | `packages/plugin-sdk/src/vite/index.ts` (`defineSynraPluginViteConfig`)                                                                        |
| **plugin-system/06-install-and-load.md**                         | npm/git/URL 三源 + 多端自动同步 + 状态机                                    | `apps/frontend/src/plugins/host/` + `file-transfer/`                                                                                           |
| **plugin-system/07-cross-platform-and-perf.md**                  | 跨端 Adapter + perf targets                                                 | `packages/plugin-sdk/src/bridges/*`                                                                                                            |
| **plugin-system/08-plugin-author-cookbook.md**                   | plugin 作者 5 分钟起步                                                      | `D:/Projects/synra-plugin-starter`（多 tab 演示样本）                                                                                          |
| **plugin-system/09-host-vue-importmap-and-capacitor-android.md** | host vendor-vue chunk + importmap + Capacitor blob 加载链路（**实测沉淀**） | `apps/frontend/vite.config.ts`（`synraVueVendorChunk` + `synraVueImportmap`）+ `plugin-route-binder.ts#importPluginBundleContentWithImportMap` |
| `ai-docs/mobile-plugin-runtime/*`                                | （已删除 — v3 不再有 mobile 独立 doc）                                      | 已并入 plugin-system/07                                                                                                                        |
| `ai-docs/plugin-sdk/*`                                           | （已删除 — 合并到 v3 plugin-system）                                        | 已并入 plugin-system/                                                                                                                          |
| `ai-docs/plugin-system-archive/*`                                | （已删除 — 历史不再保留）                                                   | —                                                                                                                                              |
| `ai-docs/plugin-chat-sdk-archive/*`                              | （已删除 — 历史不再保留）                                                   | —                                                                                                                                              |
| `ai-docs/plugin-chat-sdk/*`                                      | （已删除 — 内容并入 plugin-system/）                                        | 见 `plugin-system/06-install-and-load.md`                                                                                                      |
| frontend/*                                                       | 产品页 + 壳                                                                 | `apps/frontend/src/{pages,components,composables}`                                                                                             |
| capacitor-implementation/*                                       | 容器接入                                                                    | `apps/mobile/{android,ios}` + `capacitor.config.ts`                                                                                            |
| capacitor-electron-implementation/*                              | Electron 桥                                                                 | `packages/capacitor-electron/src/{bridge,host,shared}`                                                                                         |
| device-cluster-architecture/*                                    | 集群 + 单主机                                                               | 已落点对点；单主机中继/选主**未落地**                                                                                                          |
| cross-platform-communication-map/*                               | 三端注释索引                                                                | 各文件内 `SYNRA-COMM::*` 注释                                                                                                                  |
| communication-use-event-refactor/*                               | 统一 envelope                                                               | `@synra/envelope` + `@synra/hooks/envelope/*`                                                                                                  |
| file-transfer/*                                                  | `file.transfer.*` 唯一数据面                                                | `protocol/file-transfer.ts` + `hooks/use-file-transfer.ts` + v3 用于 bundle 跨端同步                                                           |

## 5. 当前未解决 / 待攻克的问题（v3 视角，截至 2026-07-21）

**已落地（从待攻克清单移除）**：`@synra/plugin-sdk` 包骨架、tsdown 单 bundle 构建（`defineSynraPluginViteConfig`）、host 决定 runtime、host vendor-vue chunk + importmap、Capacitor Android 上的 plugin bundle 加载链路（hello MVP 验证通过）、npm 安装源解析与多端自动同步的 file.transfer 主链路。

**剩余待攻克（按价值排序）**：

1. **9 个 namespace 完整实现**：env / log / event / ui / device / storage / action / network / fs——目前 ui / event / device 已通，其余是 stub，需要按 SDK 9-namespace 完整收敛。
2. **Bridge 适配 3 种 runtime**（main / worker / process）——目前只用 main；如需要隔离再展开。
3. **`synra-sdk` CLI**（build / verify / sign / publish / dev）+ **4 条 lint rules**（`synra/no-undeclared-capability` 等）——目前用 `vp pack`，CLI 与 lint 收口未做。
4. **git / URL 安装源解析器**——只 npm 已通；git / URL 待实现。
5. **ed25519 sign / verify + Registry UI / Marketplace**——目前是 trust-on-install。
6. **Bundle cache + 热重载（dev WS）**——目前是 cold-load + LAN push。
7. **Compose / Cascade（DAG 启用）**——目前是单 plugin 启用。
8. **Bench 套件（mitata）**——验证 v3 性能目标。
9. **删除 v1 / v2 残留**：仓库里仍有 `packages/plugin-system/` 下若干 v1/v2 模块（`manifest.ts` / `tgz-extract.ts` / `resolve-ui-entry.ts` 等），不再被 v3 host 路径引用但未清理。

**非插件系统的剩余问题**：

- 集群单主机中继与选主；
- iOS 工程骨架需在 macOS 上 `cap add ios` 才能完整生成；
- 断点续传 / progress 帧 / `syncSessionId` 硬约束；
- 可观测性：跨设备错误码聚合、传输层指标。

## 6. 接下来建议的推进顺序（v3 路线图）

按价值 / 阻断关系排序：

1. **`@synra/plugin-sdk` 包骨架 + `createSynraSDK` + `capabilityProxy`**（M0）— 1 周
   - `capabilityProxy` 实现 + glob match；
   - 9 namespace stub；
   - `createSynraSDK` 工厂（**保持命名**）；
   - 3 个 bridge stub；
   - lint rules stub。
2. **Log / Storage / Network / Fs / Action namespace 完整实现**（M1')— 1 周
   - Storage 走 Capacitor Preferences / IndexedDB / Node fs 适配；
   - Network / Fs 走 host 内 Node fs / Capacitor Filesystem；
   - Action / Log stub 落地；
   - UI / Event / Device 已在用，本次只收口。
3. **`synra-sdk` CLI + 4 条 lint rules**（M3'）— 1 周
   - `synra-sdk build / dev / verify / sign / publish`；
   - `synra/no-undeclared-capability` 等 4 条 lint 完整 + 测试；
   - 当前用 `vp pack`（已通），CLI 是薄封装。
4. **git / URL 安装源解析器**（M2'）— 0.5 周
   - 复用 npm 源的状态机骨架；
   - 加 git clone + tar 与 URL 直下载两条路径。
5. **Cache + 热重载**（M4）— 0.5 周
   - LRU 200 模块缓存；
   - dev WS 协议；
   - `WeakRef` 自动 GC。
6. **Signature + Marketplace UI**（M5）— 1 周
   - ed25519 sign / verify；
   - _Plugins_ 面板重做（含 npm/git/URL 输入框）。
7. **删除 v1 / v2 残留路径**（M6'）— 0.5 周
   - `packages/plugin-system/{manifest.ts, tgz-extract.ts, resolve-ui-entry.ts, install-store.ts, browser/}`；
   - 一切不再被 host 路径引用的 v2 工具函数。
8. **Bench 套件（mitata）**（M5 同步）— 0.5 周
   - v2 vs v3 性能对照；
   - 阈值检查。
9. **Mobile / Electron 端验证**（M6）— 1 周
   - iOS 真机验证 plugin 启用 + 自动同步；
   - Android 已经走通（hello MVP），chat plugin 待同步后验证；
   - Electron utilityProcess fallback 验证（如果启用 3 runtime）。

总计约 5-6 周（M1' / M3' / M2' / M4 / M5 / M6）。

**MVP 最短路径**：M1' + M3' + M2' = 2.5 周。

## 7. 性能目标（v3 必须达到）

| 指标                           | 目标    |
| ------------------------------ | ------- |
| 冷启动 → 首屏                  | < 500ms |
| 启 1 plugin (`main`)           | < 50ms  |
| `device.send` 同进程           | < 0.1ms |
| `device.send` 经 Worker bridge | < 1ms   |
| Bundle 加载（cache hit）       | < 10ms  |
| 内存（10 plugins enabled）     | < 50 MB |
| Capability Proxy 单 call       | < 0.3μs |

详见 [plugin-system/07-cross-platform-and-perf.md §5](./plugin-system/07-cross-platform-and-perf.md)。

## 8. v3 关键约束速查（2026-07-20 修订）

| #   | 约束                                                                                    | 实现位置                                                                                                         |
| --- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | 唯一入口 = `setup(context)`                                                             | [03-sdk-surface.md §4](./plugin-system/03-sdk-surface.md)                                                        |
| 2   | 每个 SDK 调用必须 capability 声明                                                       | [02-capability-gate.md](./plugin-system/02-capability-gate.md)                                                   |
| 3   | 隔离由 host 决定；plugin 不写 `kind / runtime / isolation`                              | [01-runtime-and-isolation.md](./plugin-system/01-runtime-and-isolation.md)                                       |
| 4   | 打包输出固定 `dist/synra/index.js`；npm 依赖内联                                        | [05-build-and-bundle.md](./plugin-system/05-build-and-bundle.md)                                                 |
| 5   | 运行时按需从 npm/git/URL 安装；多端自动同步                                             | [06-install-and-load.md](./plugin-system/06-install-and-load.md)                                                 |
| 6   | `@synra/plugin-sdk` types-only；plugin bundle 零运行时外部依赖                          | [00-plugin-runtime-model.md](./plugin-system/00-plugin-runtime-model.md)                                         |
| 7   | Host 共享 vue（vendor-vue chunk + importmap）；Capacitor 路径用 fetch+rewrite+Blob 加载 | [09-host-vue-importmap-and-capacitor-android.md](./plugin-system/09-host-vue-importmap-and-capacitor-android.md) |

## 9. 文档使用提示（v3）

- **改 SDK 接口**：先改 [`plugin-system/03-sdk-surface.md`](./plugin-system/03-sdk-surface.md) + `plugin-system/02-capability-gate.md`，再到 `@synra/plugin-sdk` 实现。
- **改插件 manifest schema**：先改 [`plugin-system/05-build-and-bundle.md`](./plugin-system/05-build-and-bundle.md) §3 与 `plugin-system/06-install-and-load.md` §2，再到 `@synra/plugin-system/manifest-v3.ts`。
- **改 lifecycle / load 行为**：先改 [`plugin-system/06-install-and-load.md`](./plugin-system/06-install-and-load.md)，再到 `apps/web/plugins/registry.ts` + `loader.ts` + `lifecycle.ts`。
- **改隔离语义**：先改 [`plugin-system/01-runtime-and-isolation.md`](./plugin-system/01-runtime-and-isolation.md)，再到 `runtime-allocator.ts` 实现。
- **改 capability 语法**：先改 [`plugin-system/02-capability-gate.md`](./plugin-system/02-capability-gate.md) §1（字符串语法），再到 lint rule 实现 + `capabilityProxy` glob matcher。
- **改文件传输语义**：先改 `file-transfer/README.md` + `04-protocol-events-and-payload.md`，再到 `@synra/protocol/src/file-transfer.ts` + `@synra/hooks/src/file-transfer/use-file-transfer.ts`。
- **改设备发现 / 主机中继**：先改 `device-cluster-architecture/README.md`，再到 `@synra/hooks/src/runtime/*`。
- **新增 plugin 作者文档**：参考 [`plugin-system/08-plugin-author-cookbook.md`](./plugin-system/08-plugin-author-cookbook.md)。
- **改了 plugin-system 任一文件 → 同步检查 README.md §"核心约束" 与 DEVELOPMENT_PROGRESS.md §8 "关键约束速查"**。
