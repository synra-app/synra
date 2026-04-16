# Synra 主流程执行清单

工作区：`D:/Projects/synra-monorepo`

## 一、协议与命名

- [ ] 核对所有新库命名使用 `@synra/*`
- [ ] 冻结跨端消息协议（严格同 major）与错误码（分组 + 关键细码）
- [ ] 冻结消息最小字段：`messageId/sessionId/timestamp/type/payload`
- [ ] 冻结 messageType：`runtime.request/received/started/finished/error`
- [ ] 冻结三阶段回执：`RECEIVED/STARTED/FINISHED`
- [ ] 冻结 `runtime.finished.status`：`success/failed/cancelled`
- [ ] 输出 `@synra/protocol` TypeScript 类型草案并评审

## 二、通讯链路（MVP：LAN）

- [ ] 实现配对入口：扫码、配对码、主动发现后手动确认
- [ ] 实现 LAN 发现与直连
- [ ] 实现保守重试与 `messageId` 幂等去重
- [ ] 实现发送前失败语义：`DEVICE_OFFLINE` / `NOT_PAIRED` / `SESSION_EXPIRED`
- [ ] 建立双状态机（传输层 + 会话层）与观测日志

## 三、插件运行时

- [ ] 实现插件注册中心
- [ ] 实现匹配排序与候选动作聚合
- [ ] 固化“每次用户选择动作”策略（不做默认记忆）
- [ ] 实现隔离执行（Worker/子进程），插件卡住不影响主进程
- [ ] 实现统一执行超时与 `EXECUTION_TIMEOUT`
- [ ] 输出 `@synra/plugin-sdk` / `@synra/plugin-runtime` 接口草案并评审
- [ ] 实现 PC 侧插件目录接口：catalog / bundle / rules
- [ ] 完成 Github 打开插件示例

## 四、Electron 集成

- [ ] 将插件执行动作接入 `@synra/capacitor-electron`
- [ ] 打通 `invoke` 到 PC 动作适配器
- [ ] 完成端到端联调：手机触发 -> 用户选择 -> PC 执行 -> 回执反馈
- [ ] 打通设备连接后插件同步链路（清单、插件包、规则）

## 五、可观测与验收

- [ ] 覆盖主链路测试（手机触发 -> 用户选择 -> PC 执行 -> 三阶段回执）
- [ ] 覆盖弱网重试测试（无重复执行、错误可解释）
- [ ] 覆盖鉴权失败手动修复流程测试
- [ ] 覆盖观测事件：连接、消息生命周期、配对、插件决策、UI 提示

## 六、发布前检查

- [ ] 确认 Relay 为后置能力，仅保留接口与文档占位
- [ ] 核对文档、包名、导入示例一致
- [ ] 运行 `vp check`、`vp test`、`vp pack`
