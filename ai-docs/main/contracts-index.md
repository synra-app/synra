# Synra 契约索引（MVP）

## 目的

本页作为 `ai-docs/main` 的契约速查索引，集中列出跨端协议、插件运行时、包边界中的核心类型与接口，避免在多文档间反复跳转。

## 总体约束（MVP）

- 平台无关底层优先，主链路仅覆盖 LAN。
- 协议版本采用严格同 major。
- 消息类型固定为 namespaced 枚举。
- 回执采用三阶段并强制 `runtime.finished.status`。
- 插件动作每次用户选择，不做默认记忆。
- PC 作为插件清单、插件包和规则配置的服务端来源。

## `@synra/protocol`

来源文档：`cross-device-transport.md`

核心类型：

- `ProtocolMessageType`
  - 执行链路：`runtime.request/received/started/finished/error`
  - 插件同步链路：`plugin.catalog.*` / `plugin.bundle.*` / `plugin.rules.*`
- `RuntimeFinishedStatus`
  - `"success" | "failed" | "cancelled"`
- `ProtocolErrorCode`
  - `TRANSPORT_* / PAIRING_* / RUNTIME_* / PLUGIN_* / USER_*` 关键细码集合
- `ProtocolEnvelope<TType, TPayload>`
- `SynraRuntimeMessage`
- `SynraPluginSyncMessage`
- `SynraProtocolMessage`

关键字段：

- `messageId`: UUID v4
- `sessionId`: pair-level session id
- `timestamp`: Unix ms
- `type`: namespaced message type
- `payload`: typed by message type

行为约束：

- `runtime.request` 后必须进入 `runtime.received` 或 `runtime.error`。
- `runtime.started` 后必须以 `runtime.finished` 终结。
- `runtime.finished.status=failed` 时必须带 `{ code, message }`。
- 用户取消统一使用 `runtime.finished.status=cancelled`。
- 设备连接后应先拉取 `plugin.catalog`，再按需拉取 bundle 和 rules。

## `@synra/plugin-sdk`

来源文档：`plugin-runtime-design.md`

核心类型：

- `ShareInput`
- `PluginMatchResult`
- `PluginAction`（`payload: unknown`）
- `ExecuteContext`
- `PluginExecutionResult`
- `SynraPlugin`

行为约束：

- `supports()` 仅负责匹配判断，不执行副作用。
- `buildActions()` 返回候选动作集合。
- `execute()` 返回结构化结果；失败时返回 `{ code, message }`。

## `@synra/plugin-runtime`

来源文档：`plugin-runtime-design.md`

核心接口：

- `PluginRuntime`
  - `register() / unregister() / listPlugins()`
  - `resolveActions()`
  - `executeSelected()`
- `PluginActionCandidate`
- `RuntimeMessageBridge`
- `PluginCatalogService`

行为约束：

- 收到请求后先发 `runtime.received`。
- 进入隔离执行后发 `runtime.started`。
- 结束时发 `runtime.finished`（必须有 `status`）。
- 无法进入执行闭环时发 `runtime.error`。
- 插件同步由 PC 响应 `plugin.catalog` / `plugin.bundle` / `plugin.rules` 请求。

隔离要求：

- 统一调度层。
- 插件在独立 Worker/子进程执行。
- 插件卡住不影响主进程。

## `@synra/transport-core`

来源文档：`package-splitting.md`

建议导出：

- `DeviceTransport`
- `TransportState`
- `SessionState`
- `send(message: SynraRuntimeMessage)`

行为约束：

- 仅支持 MVP LAN 主链路。
- 保守重试 + `messageId` 去重。
- 发送前不可达直接失败并返回细分错误码。

## 文档映射关系

- 协议定义与状态约束：`cross-device-transport.md`
- 插件接口与执行编排：`plugin-runtime-design.md`
- 包边界与导出职责：`package-splitting.md`
- 里程碑与交付节奏：`roadmap.md`
- 执行与验收任务：`checklist.md`

## 开发落地建议

- 先以本页为入口冻结类型命名，再分别下沉到各包实现。
- 如果协议枚举有变更，先改 `@synra/protocol`，再同步 runtime 与 transport。
- 合并前检查文档中 messageType 与 status 枚举是否一致。
