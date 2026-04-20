# Synra 统一设备主机文档

整理日期：2026-04-20

本目录定义 Synra 的目标态跨设备通信方案：

- 客户端与移动端行为统一，均可运行 TCP 服务并参与发现。
- 任意设备可被扫描与邀请连接。
- 集群任一时刻仅有一个主机承担中继与权威服务职责。
- 主机失效后自动选举新主机继续中继，不中断整体可用性目标。

## 阅读顺序

1. `product-goals-and-scenarios.md`
2. `network-discovery-and-invitation.md`
3. `single-host-relay-model.md`
4. `host-election-principles.md`
5. `host-election-algorithm-appendix.md`
6. `session-and-transport-contracts.md`
7. `plugin-sync-and-runtime-routing.md`
8. `failure-recovery-and-observability.md`
9. `design-patterns-and-performance-guide.md`
10. `rollout-checklist.md`

## 文档范围

- 统一设备角色建模与连接行为
- LAN 发现、扫描、邀请、握手
- 单主机中继模型与路由约束
- 主机故障后的自动选举与接管
- 会话协议、消息幂等、错误语义
- 插件与规则的主服务同步策略
- 故障恢复流程与可观测指标

## 术语表

- `Node`：任意设备实例（移动端或客户端）。
- `Member`：加入集群的普通节点，向主机发送或接收业务请求。
- `Host`：当前主机节点，承担中继路由与插件/规则权威服务。
- `Candidate`：在选举窗口内具备竞选主机资格的节点。
- `Cluster`：同一会话域内互联节点集合。
- `Term`：选举任期号，单调递增。
- `Epoch`：主机配置代号，用于标记主机切换后的配置版本。
- `Session`：节点间已鉴权连接上下文。
- `Relay`：由主机执行的成员间消息转发与回执聚合。
- `PluginCatalogAuthority`：由主机维护的插件清单与规则配置权威视图。

## 文档使用约束

- 本目录只陈述目标态方案，不包含历史方案叙述。
- 实施阶段如调整协议，必须同步更新对应文档与术语。
- 本目录允许激进式重构，无需考虑既有实现与向后兼容。
