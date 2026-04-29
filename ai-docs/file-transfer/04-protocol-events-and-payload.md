# 协议：事件族、`payload` 规范与 `requestId` / `transferId`

本文档为**规范性**说明：线上事件名、`packages/protocol` 类型与信封字段的关系。实现须与此一致。

## 已定结论：与旧「决策表」的关系

曾有草案在两条路径间取舍：**保留 `plugin.bundle.*` 事件名、仅在 `payload` 内加 `kind` / `transferId`**，或 **`file.transfer.*` 与 `plugin.bundle.*` 并行两套事件再映射**。当前结论如下：

- **连接数据面只使用 `file.transfer.*`**：`request`、`chunk`、`complete`、`abort`，以及可选的 **`progress`**。
- **`plugin.bundle.*` 不作为线上事件名**；`packages/protocol` 中的插件同步类型已收敛到 **`file.transfer.*`** 与 **`payload.kind`**，不存在两套并行事件族，也不再做新旧事件名的兼容映射层。

## 进度数据与进度 UI

- **进度 UI**：当前迭代不做；后续在「插件传输」等产品流程中再做界面。
- **进度数据**：本期必须在应用侧能拿到客观量；接收路径可在组装状态机上读取 **`PluginBundleTransferAssembly.getProgressSnapshot()`** 得到已收块数、总块数、已解码字节量等，无需依赖 **`file.transfer.progress`** 帧。若将来需要对端显式确认进度，再启用线上 **`file.transfer.progress`**。

## 手机端范围

手机端须实现 **request → chunk → complete** 的完整接收与校验落盘路径；近期工作重心为 **手机接收插件包文件** 这一条链路。

## 事件族一览（`file.transfer.*` 为唯一数据面）

| 约定                                | 说明                                                                                                                                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **规范事件**                        | `file.transfer.request`、`file.transfer.chunk`、`file.transfer.complete`、`file.transfer.abort`；可选 **`file.transfer.progress`**（会话级进度确认）。                                                               |
| **与历史 `plugin.bundle.*` 的关系** | **不再使用** `plugin.bundle.request` / `chunk` / `complete` 作为连接数据面事件名。插件包同步改为在同一套 `file.transfer.*` 上发送，并在 **`payload.kind === 'plugin-bundle'`** 下携带 `pluginId`、`version` 等字段。 |
| **共用会话逻辑**                    | 插件包、附件等仅通过 **`kind`** 与 payload 判别式区分；共享同一套分块与组装状态机（见 [`packages/hooks`](../../packages/hooks/src/file-transfer/) 实现目录）。                                                       |

## 逻辑 `event` 与 `_plugin.{slug}.` 前缀

协议与本文中的 **`file.transfer.*`** 指**逻辑事件名**：`packages/protocol` 类型、`payload` 字段与跨端对齐均以该字符串为准。

插件侧**不必**单独定义一套文件传输协议。插件代码通过 **`useSynraPluginEnvelope`** 收发时，传入的仍是逻辑名 **`file.transfer.request`** / **`chunk`** / **`complete`** 等；与 **`useSynraEnvelope`** 体系相同，由 **`toPluginWireEvent`** 在 **`event` 字符串上自动加 `_plugin.{slug}.`**，线上形如 **`_plugin.{slug}.file.transfer.chunk`**。入站时在回调里会得到去掉前缀后的逻辑名，便于与协议类型对照。

宿主直连连接层、不经插件前缀封装的路径，仍可使用裸逻辑名 **`file.transfer.*`** 作为 **`event`**。

## `requestId`（信封）与 `transferId`（会话）

| 字段             | 所在位置                 | 含义                                                                                                                                    |
| ---------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **`requestId`**  | 消息**信封**（每帧一条） | 标识**单次发送**，用于 ACK、`replyRequestId` 关联等传输语义。**每一块 chunk 使用新的 `requestId` 属于正常用法。**                       |
| **`transferId`** | **`payload` 内**         | 标识**一次文件或大对象传输会话**；接收端按 `transferId` 聚合多块、驱动状态机。可选 **`syncSessionId`** 与轮次绑定，防止跨同步轮次混块。 |

二者不可互相替代：不要用 `requestId` 当作会话 id 做组装键。

## `payload` 最小字段（均在信封 `payload` 内）

类型定义以 **`packages/protocol`**（`FileTransfer*` 类型）为准。以下为摘要：

### 共有维度

- **`transferId`**：`string`，会话 id。
- **`kind`**：`'plugin-bundle' \| 'attachment'`（可随协议扩展枚举）。
- **`syncSessionId`**：可选，与插件同步轮次或业务上下文对齐。

### `file.transfer.request`（可选）

发起方可发送一次，用于声明意图与元数据（字节长度提示等）。**允许省略**：例如宿主可从第一块 `chunk` 再推断（仍以协议类型为准）。

### `file.transfer.chunk`

- **必选**：`chunkIndex`（从 0 开始）、`totalChunks`、`chunkBase64`。
- **`kind: 'plugin-bundle'`**：`pluginId`、`version`。
- **`kind: 'attachment'`**：`fileName`；可选 `contextId` 等（见类型）。

### `file.transfer.complete`

- **`totalChunks`**；可选 **`sha256`**（整包）。
- 按 **`kind`** 携带 `plugin-bundle` 或 `attachment` 侧必要字段。

### `file.transfer.abort`

- **`transferId`**；可选 **`reason`**、**`code`**（与 `SynraErrorCode` 对齐时可选用）。

### `file.transfer.progress`（可选）

- **`transferId`**、**`receivedThroughChunkIndex`**（已确认处理到的块序号，含义见 [03](./03-reliability-and-resume.md)）。
- 用于**会话级**进度或 checkpoint，**不是**传输层 `device.tcp.ack`。

## 编码与体积（默认）

- **默认**：JSON **`payload`** 内使用 **`chunkBase64`** 承载二进制块（与既有插件包分块实现一致）。
- **非目标（本文档范围）**：另行开辟不经 JSON/base64 的大对象通道；若未来引入，须在独立文档说明，且仍不得扩展**信封**字段。

## 三端注释落点

- **会话编排、组包、订阅**：主要在 **TypeScript**（Electron 主进程 bridge、`@synra/hooks`、前端）。
- **原生（Android / iOS）**：若在连接层仅传递 JSON 字符串，可不实现独立「FILE_TRANSFER」原生模块；对应 **`SYNRA-COMM::FILE_TRANSFER::*`** 注释仍可用于标记「与会话组装相关的原生钩子」（若有）。全仓搜索 NodeId 时以实际命中文件为准。
