# Synra 插件系统（v3 · 单 Runtime + Capability Proxy + 共享 Vue Runtime）

> 修订日期：2026-07-21（Capacitor Android 链路修复 + 文档归档收敛）
> 范围：`ai-docs/plugin-system/` 全部内容 + 当前仓库实现快照（`apps/frontend`、`apps/mobile`、`packages/plugin-sdk`）。
> 本目录是**v3 插件系统**的权威说明；对照实现以 `apps/frontend/src/plugins/host/`、`packages/plugin-sdk/src/`、`apps/frontend/vite.config.ts` 为准。

## v3 关键约束速查

| #   | 约束                                                                  | 实现位置                                                                                                                     |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | Plugin 单 bundle，固定 `dist/synra/index.js`                          | `packages/plugin-sdk/src/vite/index.ts` (`defineSynraPluginViteConfig`)                                                      |
| 2   | `@synra/plugin-sdk` 仅 types-only；plugin bundle **零运行时外部依赖** | plugin `vite.config.ts` 把 `@synra/plugin-sdk` 设 external；host 在 v3 通过 `provide(SYNRA_BRIDGE_KEY, bridge)` 注入真实实现 |
| 3   | Host 把 `vue` 共享给 plugin（vendor-vue chunk + importmap）           | `apps/frontend/vite.config.ts`：`synraVueVendorChunk()` + `synraVueImportmap()`                                              |
| 4   | Host 在 Capacitor 路径上重写裸 specifier 后用 Blob URL 加载           | `apps/frontend/src/plugins/host/plugin-route-binder.ts#importPluginBundleContentWithImportMap`                               |
| 5   | 隔离由 host 决定；plugin 不写 `kind / runtime / isolation`            | [01-runtime-and-isolation.md](./01-runtime-and-isolation.md)                                                                 |
| 6   | 运行时按需从 npm / git / URL 安装；多端自动同步                       | [06-install-and-load.md](./06-install-and-load.md)                                                                           |

## 一句话总结（来自 [00-plugin-runtime-model.md](./00-plugin-runtime-model.md)）

> `@synra/plugin-sdk` 退化成 types-only 包；plugin bundle 零运行时外部依赖；host 通过 `provide(SYNRA_BRIDGE_KEY, bridge)` 把一个 closure-based `PluginBridge` 注入插件的 Vue 组件树；`PluginBridge` 内部 closure 绑定 host 内部的单例状态。

## 与跨端通讯 / hooks 的关系

日常业务侧收发 Synra 消息：系统侧用 **`useSynraSystemEnvelope`**，插件侧用 **`useSynraPluginEnvelope`**，需完整控制线上 `event` 时用 **`useSynraEnvelope`**。**`_synra.`** / **`_plugin.{slug}.`** 前缀规则、消息信封白名单、宿主 / 渲染 / 原生桥、Electron IPC 见 [communication-use-event-refactor/README.md](../communication-use-event-refactor/README.md) 与 [cross-platform-communication-map/README.md](../cross-platform-communication-map/README.md)。

## 文件传输与插件包同步

跨设备大对象与插件包推送的数据面事件族为 **`file.transfer.*`**（唯一）；**`transferId` 与信封 `requestId` 的分工**、**payload** 形状见 [file-transfer/](../file-transfer/) 与 [cross-platform-communication-map/](../cross-platform-communication-map/)。**v3 不再传 tarball**：host 在桌面跑 `vp pack` 产 `dist/synra/index.js`，把这个单 bundle 通过 `file.transfer.*` 推到手机；手机端验签后用 [09-host-vue-importmap-and-capacitor-android.md](./09-host-vue-importmap-and-capacitor-android.md) 的链路挂载。

## 与集群文档的关系

多机场景下的目录权威、bundle 同步策略见 [device-cluster-architecture/plugin-sync-and-runtime-routing.md](../device-cluster-architecture/plugin-sync-and-runtime-routing.md)。本目录默认覆盖「单机宿主 + 点对点推到手机」；集群可作为上层编排扩展同一套包校验与版本语义。

## 术语表

| 术语           | 含义                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| `pluginId`     | 从包名推导的稳定标识（不含 scope 前缀），用于路由、目录键、同步消息。                                     |
| `artifactRoot` | 落盘后的插件文件树根路径。                                                                                |
| `PluginBridge` | Host 通过 `provide(SYNRA_BRIDGE_KEY, ...)` 注入给插件子树的对象；承载所有 SDK namespace 的 closure 实现。 |
| Catalog        | 面向 UI 的插件条目列表（含展示字段与安装状态）。                                                          |
| Registry       | npm 兼容的元数据与 tarball 源（可自建镜像）。                                                             |

## 设计原则

- 协议与类型在 **shared 包** 中统一定义，各端实现与序列化一致。
- 移动端「安装」= **bundle 同步 + 完整性校验 + 注册激活**，不是应用商店安装。
- 安全：只从**白名单** registry / 索引拉取；校验失败**不**进入激活与路由。
- plugin bundle **零运行时外部依赖**——`@synra/plugin-sdk` 仅 types；`vue` 由 host 共享；其他 npm 依赖一律 inline。
- WebView 加载动态 import 的 spec 必须解析得到——host 负责把这条链路在所有平台（包括 Capacitor Android WebView）走通。

## 文档索引（v3 · 10 篇）

| #   | 主题                                                                                              | 关键产物                                                               |
| --- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 00  | [Plugin Runtime Model](./00-plugin-runtime-model.md)                                              | v3 半成品收敛总览：plugin-sdk types-only + PluginBridge 注入模型       |
| 01  | [Runtime & Isolation](./01-runtime-and-isolation.md)                                              | host 决定 runtime；plugin 不写 `kind / runtime / isolation`            |
| 02  | [Capability Gate](./02-capability-gate.md)                                                        | Proxy + capability 字符串语法 + 错误模型                               |
| 03  | [SDK Surface](./03-sdk-surface.md)                                                                | `createSynraSDK` 工厂 + 9 namespace + Lazy Proxy                       |
| 04  | [Design Patterns](./04-design-patterns.md)                                                        | 13+ 模式总览                                                           |
| 05  | [Build & Bundle](./05-build-and-bundle.md)                                                        | 单一 bundle（`dist/synra/index.js`）+ npm deps 内联 + lint rules       |
| 06  | [Install & Load & Auto-Sync](./06-install-and-load.md)                                            | npm/git/URL 三源 + 多端自动同步 + 状态机                               |
| 07  | [Cross-Platform & Performance](./07-cross-platform-and-perf.md)                                   | 跨端 Adapter + perf targets                                            |
| 08  | [Plugin Author Cookbook](./08-plugin-author-cookbook.md)                                          | plugin 作者 5 分钟起步                                                 |
| 09  | [Host→Plugin Vue ImportMap & Capacitor Android](./09-host-vue-importmap-and-capacitor-android.md) | vendor-vue chunk + importmap + Capacitor blob 加载链路（**实测沉淀**） |

参考实现仓库：`D:/Projects/synra-plugin-starter`（多 tab 演示 plugin，覆盖 platform / external / network / pairing / storage 五条 v3 host→plugin 能力链路）。
