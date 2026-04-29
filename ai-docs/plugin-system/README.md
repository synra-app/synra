# Synra 插件系统（实现规范）

本目录描述从零构建「发现 → 安装 → 桌面激活 → 手机同步」插件系统时应遵循的目标能力、模块边界、协议与实施顺序。**不以既有代码为准**，实现时可对照本文校验完备性。

## 能力范围

| 能力         | 说明                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 发现与目录   | 用户能知道可装哪些插件、版本与展示信息；支持搜索/过滤（语义见 [02-discovery-and-catalog.md](./02-discovery-and-catalog.md)）。        |
| 桌面宿主安装 | 从受信任的 registry 获取包元数据与 tarball，校验并解压到宿主沙箱路径，形成可引用的 `artifactRoot`。                                   |
| 激活与运行时 | 将 UI 入口以 `import()` 方式挂入宿主，注册动态路由与 SDK 生命周期。                                                                   |
| 手机同步     | 在已建立设备连接的前提下，将同一份包（或等价制品）分块传到手机，落盘、校验、再按与桌面相同或子集的激活路径注册。                      |
| 前端设置     | Settings 中 **Plugin** 页签：选择 `registryUrl` 白名单镜像（见 [09-frontend-plugin-settings.md](./09-frontend-plugin-settings.md)）。 |

## Peer 依赖与构建 external

插件 UI 与宿主共享 `vue`、`@synra/hooks`、未来组件库等大依赖时，须在 **package.json** 中声明为 **peer**，并在插件 **构建配置** 中将对应模块设为 **external**，由宿主或手机壳在运行时提供同一份解析结果（import map / 联邦等）。桌面激活与 UI `import()` 的约束见 [04-activate-and-runtime.md](./04-activate-and-runtime.md)；同步到手机后的推论见 [05-sync-to-mobile.md](./05-sync-to-mobile.md)。

## 与跨端通讯 / hooks

日常业务侧收发 Synra 消息应使用 **`useSynraSystemEnvelope`**（系统侧逻辑事件名）或 **`useSynraPluginEnvelope`**（插件事件）；需完整控制线上 `event` 字符串时使用底层 **`useSynraEnvelope`**（或 `@synra/hooks/envelope`）。三层差异与 **`_synra.`** / **`_plugin.{slug}.`** 前缀规则见 [10-synra-envelope-hooks-and-prefixes.md](./10-synra-envelope-hooks-and-prefixes.md)。

宿主进程、渲染进程与原生桥之间的**消息信封**、白名单字段及 **Electron IPC** 等约定见 [communication-use-event-refactor/README.md](../communication-use-event-refactor/README.md)。**宿主侧事件仅通过实时通道投递**；插件系统实现遵守本节 hooks 与前缀约定即可，传输与信封细节以前述文档为准。

## 与独立 npm 包的关系

例如 [@synra-plugin/chat](https://www.npmjs.com/package/@synra-plugin/chat)：它是**符合命名与 manifest 约定**的发布物；插件系统负责**拉取、校验、落盘、注册**，不在本文档重复 Chat 产品细节。产品边界与首个插件说明见 [plugin-chat-sdk/README.md](../plugin-chat-sdk/README.md)。

## 与集群文档的关系

多机场景下的目录权威、bundle 同步策略见 [device-cluster-architecture/plugin-sync-and-runtime-routing.md](../device-cluster-architecture/plugin-sync-and-runtime-routing.md)。本目录默认覆盖「单机宿主 + 点对点推到手机」；集群可作为上层编排扩展同一套包校验与版本语义。

## 术语表

| 术语           | 含义                                                                                                                                                                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pluginId`     | 从包名推导的稳定标识（不含 scope 前缀），用于路由、目录键、同步消息。与 `useSynraPluginEnvelope` 的 `event` 前缀中 `pluginSlug` 的推导规则一致时便于对齐（见 [10-synra-envelope-hooks-and-prefixes.md](./10-synra-envelope-hooks-and-prefixes.md)）。 |
| `artifactRoot` | 解压后的插件文件树根路径（或约定下的等价 URI）。                                                                                                                                                                                                      |
| Catalog        | 面向 UI 的插件条目列表（含展示字段与安装状态）。                                                                                                                                                                                                      |
| Registry       | npm 兼容的元数据与 tarball 源（可自建镜像）。                                                                                                                                                                                                         |

## 设计原则

- 协议与类型在 **shared 包** 中统一定义，各端实现与序列化一致。
- 移动端「安装」= **产物同步 + 完整性校验 + 注册激活**，不是应用商店安装。
- 安全：只从**白名单** registry/索引拉取；校验失败**不**进入激活与路由。

## 文档索引

1. [包与 manifest 约定](./01-package-and-manifest.md)
2. [发现与目录、搜索](./02-discovery-and-catalog.md)
3. [桌面宿主安装](./03-install-desktop-host.md)
4. [激活与运行时](./04-activate-and-runtime.md)
5. [手机同步](./05-sync-to-mobile.md)
6. [分阶段实施建议](./06-implementation-phases.md)
7. [插件运行时分层（Host / UI / Worker / Shared）](./07-plugin-runtime-layers.md)
8. [插件 importx 加载器（Node 单例与 layer 形参）](./08-plugin-import-loader.md)
9. [前端设置：Plugin 页签与 npm 源](./09-frontend-plugin-settings.md)
10. [useSynraEnvelope / useSynraSystemEnvelope / 前缀与插件 event 约定](./10-synra-envelope-hooks-and-prefixes.md)
11. [文件传输封装（分块会话、hooks 与 plugin-sdk）](../file-transfer/README.md)

参考实现仓库：[synra-app/synra-plugin-chat](https://github.com/synra-app/synra-plugin-chat)（多入口 `exports` 与 `synra.entries`）。
