# Synra 文件传输封装

本目录描述**跨设备大对象传输**的目标分层：在现有消息信封与连接能力之上，封装**可复用的分块会话**，供**插件包同步**、**插件 SDK 开放能力**（如 Chat 附件）等场景共用同一套逻辑，而不在传输插件里复制 chunk 协议。

**协议演进结论**：连接上只存在 **`file.transfer.*`** 这一套数据面事件；历史上讨论的「保留 `plugin.bundle.*` 事件名」或「两套事件并行」**不作为当前设计**，细则见 [04-protocol-events-and-payload.md](./04-protocol-events-and-payload.md)。

**近期落地**：手机端实现 **`file.transfer.*` 全链路接收**；进度 **UI 后置**，本期在数据层暴露进度相关量，见 [04](./04-protocol-events-and-payload.md)「进度数据与进度 UI」。

## 与其它文档的关系

| 文档                                                                                                                                          | 关系                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [cross-platform-communication-map/message-envelope-and-validation.md](../cross-platform-communication-map/message-envelope-and-validation.md) | 信封字段白名单；文件元数据、分块内容均在 **`payload`** 内表达。                            |
| [plugin-system/05-sync-to-mobile.md](../plugin-system/05-sync-to-mobile.md)                                                                   | 插件同步是本文「业务会话」层的一类用法；实现上应对齐通用传输会话，而非单独造一套分块规则。 |
| [communication-use-event-refactor/README.md](../communication-use-event-refactor/README.md)                                                   | 渲染侧收发路径仍以 `useSynraEnvelope` / `useSynraEvent` 等为表面；文件封装构建在其上。     |

## 文档索引

1. [分层模型：传输、会话、业务](./01-layered-model.md)
2. [hooks、`plugin-sdk` 与协议边界](./02-hooks-and-plugin-sdk.md)
3. [可靠性：重连、断点与宿主策略](./03-reliability-and-resume.md)
4. [协议：事件族、`payload` 规范与 `requestId` / `transferId`](./04-protocol-events-and-payload.md)

## 术语（简）

| 术语       | 含义                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------- |
| **传输层** | 已建立的设备连接上的「一帧消息」：`send` / `subscribe`（`useSynraEnvelope`），信封合规。 |
| **会话层** | 单次文件或大对象的 **`transferId`**、分块序号、`complete` / `abort`、校验与进度状态机。  |
| **业务层** | `kind` 区分插件包、聊天附件等；权限与配额在宿主或 SDK 侧约束。                           |

## 注释前缀（`SYNRA-COMM`）

实现落地沿用 [`SYNRA-COMM`](../cross-platform-communication-map/README.md)；**`FILE_TRANSFER`** 域及首批 NodeId 见该索引「Domain 列表」与 [常用 NodeId](../cross-platform-communication-map/README.md#常用-nodeid)。

类型与编解码实现参见 `@synra/protocol`（`packages/protocol/src/file-transfer.ts`）、会话封装 **`useFileTransfer`**（`@synra/hooks`）。插件内逻辑事件名仍为 **`file.transfer.*`**，经 **`useSynraPluginEvent`** 自动加 **`_plugin.{slug}.`** 前缀，无单独插件传输协议。
