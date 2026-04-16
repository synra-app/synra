# Synra 主流程路线图

## 总体策略

采用“先协议与 LAN 链路、再插件执行编排、后端到端联调与稳定化”的推进方式。  
MVP 目标是功能闭环优先：手机触发 -> PC 执行 -> 回执反馈可跑通且可解释失败。

## M1：协议与传输底座（LAN）

### 目标

- 冻结跨端消息协议（严格同 major）。
- 完成 `@synra/protocol`、`@synra/transport-core`、`@synra/transport-lan` 最小可用实现。

### 输出物

- 协议类型定义、错误码（分组 + 关键细码）。
- 消息最小字段结构（`messageId/sessionId/timestamp/type/payload`）。
- messageType 枚举（`runtime.request/received/started/finished/error`）。
- `runtime.finished.status` 语义（`success/failed/cancelled`）。
- 传输层/会话层双状态机定义。
- 基础单测。

### 验收

- 包可构建、可测试。
- 可完成 LAN 配对、连接、消息发送与失败回执。

## M2：插件契约与执行编排

### 目标

- 完成 `@synra/plugin-sdk`、`@synra/plugin-runtime` 最小可用实现。
- 打通“匹配 -> 用户选择 -> 隔离执行 -> 三阶段回执”。

### 输出物

- 插件契约（opaque payload）。
- `@synra/plugin-sdk` 类型草案（`ShareInput`、`PluginAction`、`SynraPlugin` 等）。
- `@synra/plugin-runtime` 对接接口草案（`PluginRuntime`、`RuntimeMessageBridge`）。
- PC 侧插件目录服务接口（catalog/bundle/rules）。
- 冲突策略（每次用户选择）。
- Worker/子进程隔离执行器。
- 统一超时策略（`EXECUTION_TIMEOUT`）。

### 验收

- 多插件命中时可稳定给出候选动作并完成用户选择。
- 插件卡住时主进程不被阻塞，超时后可回执失败结果。

## M3：Electron 集成与端到端闭环

### 目标

- 将运行时能力接入 `@synra/capacitor-electron`。
- 打通主链路 demo。

### 输出物

- Electron 动作适配器（如浏览器打开）。
- `invoke` 调用链路与三阶段回执透传。
- 与 `@synra/protocol` 的消息映射实现（`runtime.request -> received -> started -> finished`）。
- 设备连接后插件同步链路（`plugin.catalog`/`plugin.bundle`/`plugin.rules`）。
- Github 打开插件示例。

### 验收

- 端到端完成“手机分享 -> 用户选择 -> PC 执行 -> 回执反馈”。
- 失败路径具备可解释错误提示。

## M4：稳定化与可观测性

### 目标

- 建立可观测事件体系与弱网稳定性基线。
- 收敛手动修复流程体验。

### 输出物

- 事件模型（连接、消息生命周期、配对、插件决策、用户提示）。
- 重试成功率与重复执行率报告。
- 手动修复路径交互规范。

### 验收

- 弱网下失败行为稳定且可解释。
- 核心事件可检索、可定位问题。

## M5：Relay 规划与发布准备（后置）

### 目标

- 明确 Relay 扩展设计与接入窗口。
- 形成可发布、可回滚的版本策略。

### 输出物

- Relay 接口兼容性评估。
- 主流程性能报告与版本发布清单。

### 验收

- 关键指标达到团队设定阈值。
- 文档、包名、导入路径一致性通过检查。
