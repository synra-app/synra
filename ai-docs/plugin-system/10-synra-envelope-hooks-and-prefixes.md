# useSynraEnvelope / useSynraSystemEnvelope / useSynraPluginEnvelope 分层与 event 前缀

`@synra/hooks` 中三者在职责上**同一类能力**（`send` / `subscribe` / `request`），区别仅在于 **底层 vs 对调用方是否自动加 `event` 前缀**；**不**再使用单独的 system / plugin _domain_ 类型或 `channel` 参数，命名空间完全体现在**线上一帧的 `event` 字符串**上（仍须遵守[消息信封白名单](../cross-platform-communication-map/message-envelope-and-validation.md)所允许的字段）。

纯逻辑与类型见 **`@synra/envelope`**；Vue composable 见 **`@synra/hooks`** 或子路径 **`@synra/hooks/envelope`**。

## 分层

| 导出                                    | 职责                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`useSynraEnvelope`**                  | 底层：信封里的 `event` 即**线上真实名称**（可含协议既有名、或本约定下的带前缀名）。需自行拼完整 `event` 时用它。                                                                                                                                                                                                                                 |
| **`useSynraSystemEnvelope`**            | 产品 / 系统侧：业务只写**逻辑** `event`（如 `device.tcp.connect`），在调用 `useSynraEnvelope` 时自动加 **`_synra.`** 前缀，即线上为 `_synra.device.tcp.connect`。`subscribe` / `send` 的返回值在对外暴露时**去掉**该前缀，便于与文档中的「逻辑事件名」对齐。                                                                                     |
| **`useSynraPluginEnvelope(pluginRef)`** | 插件开发：在系统约定之上，为插件事件自动加 **`_plugin.{pluginSlug}.`** 前缀。`pluginRef` 可为包名如 `@synra-plugin/chat`（`pluginSlug` 为 `chat`）或已规范化的 `chat`。逻辑 `event` 如 `send` → 线上 `_plugin.chat.send`；`subscribe` 回调里收到的 `event` 为**逻辑段**（如 `send`），与 `useSynraSystemEnvelope` 的「去前缀后逻辑名」模式一致。 |

`useSynraSystemEnvelope` 与 `useSynraPluginEnvelope` **本质相同**（都是「薄包装 + 前缀/去前缀」），仅前缀规则不同。

## 与协议 LAN 名

LAN 有线路径仍只接受 `packages/protocol` 中注册的 `LanWireEventName`。实现上在发 **`_synra.*`** 时，会在发往 native `sendLanEvent` 前**按前缀规则剥回**协议名，避免破坏既有设备握手。连接层 `sendMessage` 则使用带前缀的 `event`（或经同一套 strip 后路由），以仓库内 `resolveSynraPostTransport` / `stripForTransportRouting` 为准（`@synra/envelope`）。

## 与插件文档

包名、`pluginId`、分层目录仍见 [01-package-and-manifest.md](./01-package-and-manifest.md) 与 [07-plugin-runtime-layers.md](./07-plugin-runtime-layers.md)。本节只约束 **事件名字符串在 hooks 三层的拼法**。

## 与 `file.transfer.*`

文件传输协议中的**逻辑** `event` 名为 **`file.transfer.request`** / **`chunk`** / **`complete`** / **`abort`**（及可选 **`progress`**）。插件代码经 **`useSynraPluginEnvelope`** 收发时仍传入上述逻辑名；线上 `event` 为 **`_plugin.{slug}.file.transfer.*`**。**不在**信封或 payload 内为插件身份增加单独字段；若将来引入 **`usePluginFileTransfer`**，也只应对 **`file.transfer.*`** 套用与 **`useSynraPluginEnvelope`** 相同的前缀逻辑。`transferId`、`payload` 字段及 **`requestId` 与会话 id 的分工**见 [file-transfer/04-protocol-events-and-payload.md](../file-transfer/04-protocol-events-and-payload.md)，本节不重复字段表。

## 实现位置（代码导航）

- 前缀与 slug 规范化：`packages/envelope/src/event-prefix.ts`
- 发往连接层前的路由解析：`packages/envelope/src/resolve-post-transport.ts`
- 底层 I/O：`packages/hooks/src/envelope/use-synra-envelope.ts`
- 系统薄封装：`packages/hooks/src/envelope/use-synra-system-envelope.ts`
- 插件薄封装：`packages/hooks/src/envelope/use-synra-plugin-envelope.ts`

## 与通讯重构总览

本节只约束 **hooks 三层与线上 `event` 字符串** 的拼法。Electron 主进程 ↔ 渲染进程 **IPC**、消息**信封**与白名单字段、**宿主事件实时投递**等架构约定见 [communication-use-event-refactor](../communication-use-event-refactor/README.md)；传输与信封细节不重复展开于此。
