# hooks、`plugin-sdk` 与协议边界

## 事件命名策略（规范）

| 约定                  | 说明                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **唯一数据面事件族**  | **`file.transfer.request`**、**`file.transfer.chunk`**、**`file.transfer.complete`**、**`file.transfer.abort`**；可选 **`file.transfer.progress`**。 |
| **`plugin.bundle.*`** | **不再**作为连接数据面事件名；插件包同步使用 **`file.transfer.*`** + **`payload.kind === 'plugin-bundle'`**。                                        |
| **协议登记**          | 事件名与 payload 类型在 **`packages/protocol`**（`FileTransfer*`、`createProtocolMessage`）统一维护。                                                |

详细字段表见 [04-protocol-events-and-payload.md](./04-protocol-events-and-payload.md)。

旧草案中的「仅扩展 payload、保留 `plugin.bundle.*` 事件名」与「`file.transfer.*` 与 `plugin.bundle.*` 并行」两条路线已收口为单一结论：**线上只有 `file.transfer.*`**，见 [04](./04-protocol-events-and-payload.md)「已定结论」。

接收侧本期不做进度 **UI**，但须在代码中能读到进度量：插件包路径使用 **`PluginBundleTransferAssembly.getProgressSnapshot()`**。

## 前端 / hooks

- **插件与宿主共用同一套逻辑事件名**：协议层始终是 **`file.transfer.*`**。插件内使用 **`useSynraPluginEnvelope`** 时，传入的 `event` 仍为 **`file.transfer.chunk`** 等逻辑名；线网自动带 **`_plugin.{slug}.`** 前缀，与 **`useSynraEnvelope` / `useSynraSystemEnvelope`** 的前缀规则同一套机制，**不需要**为插件另做传输协议或额外字段。
- **底层仍为信封收发**：**`useFileTransfer`** 内部基于 **`useSynraEnvelope`**，对逻辑名 **`file.transfer.*`** 提供薄封装；宿主侧亦可 **`useSynraPluginEnvelope` + 逻辑名** 自行发送，或直接使用 **`useSynraEnvelope`** 发送裸逻辑名。
- **协议无关工具**：`iteratePluginBundleChunks`、`PluginBundleTransferAssembly`、`fileTransferChunkCount` 由 **`@synra/protocol`** 提供；**`@synra/hooks`** 再导出以便应用侧单一入口。
- **hooks 职责**：维护会话状态（进度数据、错误、取消）、把 Blob / 文件句柄（或主进程代理传入的描述符）转为分块 payload、订阅对端 `chunk` / `complete`；进度 **UI 可后置**，进度 **数据**本期就要可用于日志或可观测接口。
- **Electron**：大文件读盘、分片节流可在 **主进程**完成（例如 `pluginSyncToDevice` bridge 使用 `iteratePluginBundleChunks`），经既有 bridge 把「已切好的块」交给连接层发送；细节由宿主选型，本目录只要求**边界清晰**。

## `plugin-sdk`

- **职责**：为第三方插件提供稳定入口，例如 **`transfer.send(options)`**、**`transfer.onIncoming(handler)`**，内部调用与宿主应用相同的会话实现（`file.transfer.*` + `kind`）。
- **约束**：插件只能使用宿主允许的 **`kind`**、大小上限与目标设备集合；不得在插件内绕过宿主自行拼装未登记的 `event`（防止滥用传输通道）。

## 协议（`packages/protocol`）

- **信封**：不新增信封字段；所有扩展置于 **`payload`**。
- **三端**：帧语义以 JSON 连接消息为主时，文件会话组装可在 **TypeScript** 完成；原生层是否增加独立模块见 [04](./04-protocol-events-and-payload.md)「三端注释落点」。

## 与插件系统文档

插件同步的高层步骤仍以 [plugin-system/05-sync-to-mobile.md](../plugin-system/05-sync-to-mobile.md) 为准；落地时发送侧应**委托会话封装**（`file.transfer.*`），避免与 Chat 等场景分裂两套 chunk 实现。
