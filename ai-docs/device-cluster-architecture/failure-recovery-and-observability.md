# 故障恢复与可观测性

## 目标

定义 V2 点对点通信下的故障恢复与可观测策略，支持快速定位问题。

## 故障分类

- 发现故障：`LanDiscovery` UDP 广播丢包、局域网隔离、设备信息过期。
- 连接故障：`DeviceConnection` TCP 建连失败、链路中断、目标不可达。
- 消息故障：消息发送失败、载荷解析失败、重复包。
- 执行故障：插件不存在、动作超时、执行器异常。

## 恢复流程

## 设备下线恢复

1. 设备主动退出前广播下线通知。
2. 其他设备收到 `deviceLost` 后移除 peer。
3. 对该 peer 的新发送请求快速失败。
4. 若后续重新发现设备，则自动恢复到可连接状态。

## 消息发送恢复

- `sendToDevice` 失败时返回错误，不做强制全局重试。
- 业务层可按场景进行幂等重试（基于 `messageId`）。
- `broadcast` 对单个目标失败不应阻塞其他目标发送。

## 可观测事件

- 发现事件：`transport.peer.discovered`、`transport.peer.lost`
- 连接事件：`transport.session.opened`、`transport.session.closed`
- 消息事件：`transport.message.received`、`transport.message.send.failed`
- 错误事件：`transport.error`、`runtime.error`

## 指标建议

- 设备发现耗时（P50/P95/P99）
- 设备在线率（基于最近发现窗口）
- 单播成功率与失败率
- 广播覆盖率（成功目标数 / 可见目标数）
- 消息重复率（按 `messageId` 去重统计）

## 排障最小信息集

- `clusterId`
- `nodeId`
- `deviceId`
- `messageId`
- `errorCode`

## 告警建议

- 单播失败率连续超阈值触发高优先级告警。
- 广播覆盖率持续偏低触发网络质量告警。
- `deviceLost` 异常突增触发稳定性告警。
