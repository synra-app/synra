# 故障恢复与可观测性

## 目标

定义主机故障、会话中断、同步异常下的恢复策略与可观测事件，支持快速定位问题。

## 故障分类

- 主机故障：主机下线、主机脑裂、主机不可达。
- 网络故障：链路抖动、连接超时、ACK 超时。
- 状态故障：成员 `term` 过期、路由表脏数据、规则版本漂移。
- 执行故障：插件不存在、动作超时、执行器异常。

## 恢复流程

## 主机失效恢复

1. 主机主动下线时先广播 `host.retire`；异常下线时由成员被动检测失联。
2. 启动选举并确认新主机。
3. 成员切换主机并重建会话。
4. 新主机恢复路由与权威同步。
5. 挂起请求执行补偿或失败回执。

## 会话恢复

- 优先恢复主机会话，后恢复成员间业务通道。
- 恢复期间暂停新业务写入，防止状态漂移。
- 恢复完成后触发增量同步并解除写保护。
- 成员主动下线时，先通知主机；主机再广播成员下线事件，成员侧同步更新路由可达性。

## 可观测事件

- 连接事件：`session.opened`、`session.closed`、`session.reconnect.start`、`session.reconnect.success`
- 主机事件：`host.retire`、`host.heartbeat.timeout`、`host.election.start`、`host.election.win`、`host.failover.complete`
- 成员状态事件：`host.member.offline`
- 路由事件：`relay.request.in`、`relay.forwarded`、`relay.result.out`
- 同步事件：`plugin.sync.start`、`plugin.sync.success`、`plugin.sync.failed`
- 错误事件：`transport.error`、`runtime.error`

## 指标建议

- 主机切换耗时（P50/P95/P99）
- 选举成功率
- 会话重连成功率
- 消息重试率与最终失败率
- 同步一致性失败率（插件/规则）

## 排障最小信息集

- `clusterId`
- `nodeId`
- `sessionId`
- `messageId`
- `term`
- `epoch`
- `errorCode`

## 告警建议

- 连续选举失败超过阈值触发高优先级告警。
- 主机切换耗时超阈值触发性能告警。
- 同步一致性异常持续升高触发配置风险告警。
