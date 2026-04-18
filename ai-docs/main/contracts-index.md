# Synra 契约索引（重构版）

## 目的

本页作为 `ai-docs/main` 的契约速查索引，集中列出跨端协议、插件运行时、包边界中的核心类型与接口，避免在多文档间反复跳转。

## 总体约束（当前代码基线）

- 以 `@synra/protocol` 作为唯一消息与事件真相源。
- 插件宿主改为 `PluginHostFacade` + `Registry/Lifecycle/RouteBinder` 分层。
- 跨端能力通过 `HostCapabilityPort` 端口抽象，不允许页面直接调用原生层。
- 传输层统一 `transport.*` 事件语义，移除历史重复广播路径。
- 运行时支持 Worker 代理与主线程回退（`WorkerProxyRuntime` / `FallbackWorkerRuntime`）。

## `@synra/protocol`（已落地）

来源文档：`cross-device-transport.md`

核心类型（`packages/protocol/src/index.ts`）：

- `SynraMessageType`
  - 插件动作链路：`share.detected`、`action.*`
  - 传输链路：`transport.session.*`、`transport.message.*`、`transport.error`
  - 扩展链路：`custom.${string}`
- `RuntimeFinishedStatus`
  - `"success" | "failed" | "cancelled"`
- `SynraCrossDevicePayloadByType`
  - `type -> payload` 判别映射
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

行为约束（当前）：

- `runtime.request` 后必须进入 `runtime.received` 或 `runtime.error`。
- `runtime.started` 后必须以 `runtime.finished` 终结。
- `runtime.finished.status=failed` 时必须带 `{ code, message }`。
- 用户取消统一使用 `runtime.finished.status=cancelled`。
- 传输层事件只使用 `transport.*` 命名，不再使用旧 `clientConnected/clientClosed/messageReceived`。
- 自定义业务消息统一落到 `custom.*` 命名空间。

## `@synra/plugin-sdk`（已落地）

来源文档：`plugin-runtime-design.md`

核心类型（`packages/plugin-sdk/src/index.ts` 与 `worker-runtime.ts`）：

- `ShareInput`
- `PluginMatchResult`
- `PluginAction`
- `ExecuteContext`
- `SynraPlugin`
- `HostCapabilityPort`
- `WorkerProxyRuntime` / `FallbackWorkerRuntime`

行为约束（当前）：

- `supports()` 仅负责匹配判断，不执行副作用。
- `buildActions()` 返回候选动作集合。
- 插件 Worker 调度必须支持超时与回退。
- 插件能力访问必须通过 `HostCapabilityPort`，避免平台 API 泄漏到插件页。

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

行为约束（当前）：

- 仅支持 MVP LAN 主链路。
- 保守重试 + `messageId` 去重。
- 发送链路需要显式背压与重试控制（已在 discovery service 落地首版）。

## 文档映射关系

- 协议定义与状态约束：`cross-device-transport.md`
- 插件接口与执行编排：`plugin-runtime-design.md`
- 包边界与导出职责：`package-splitting.md`
- 里程碑与交付节奏：`roadmap.md`
- 执行与验收任务：`checklist.md`

## 开发落地建议（重构后）

- 任何新增事件必须先在 `@synra/protocol` 注册 `type -> payload`，再向上传递到 Capacitor 与前端 store。
- 前端插件页只能通过 `PluginHostFacade` 与 `HostCapabilityPort` 间接访问能力。
- 变更完成后必须同步更新 `ai-docs` 对应章节，避免文档与实现分叉。
