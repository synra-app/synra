# 设计模式与高性能实现指南

## 全局实现原则

- 允许激进式重构，不受既有逻辑与向后兼容约束。
- 优先保证代码优雅性：高内聚、低耦合、职责单一、边界清晰。
- 优先保证性能：低复制、低锁竞争、可预测时延、可观测可调优。
- 领域模型优先于框架细节，先稳定协议与状态机，再落地具体技术栈。

## `product-goals-and-scenarios.md`

### 推荐模式

- `DDD Lite`：用 `Node/Host/Member/Session` 作为核心领域对象。
- `Use Case` 分层：每个场景映射一个独立用例服务。
- `Policy Object`：将可调整规则（超时、重试、投票阈值）配置化。

### 优雅性实现要点

- 场景层不直接依赖传输层实现，仅依赖抽象端口。
- 用例输入输出使用不可变 DTO，避免隐式状态污染。

### 性能实现要点

- 用例执行路径固定为 O(1) 路由查找 + O(n) 广播（n 为成员数）。
- 对关键场景建立基准测试（触发到回执端到端时延）。

## `network-discovery-and-invitation.md`

### 推荐模式

- `State Machine`：扫描、邀请、握手、会话建立全流程状态机化。
- `Reactor` + `Event Loop`：统一处理 socket 与发现事件。
- `Backpressure Queue`：高并发扫描结果进入有界队列。

### 优雅性实现要点

- 把发现、邀请、握手拆分为三个可独立测试的服务。
- 使用显式状态转移表，避免 if/else 蔓延。

### 性能实现要点

- 使用零拷贝或少拷贝消息缓冲（复用 byte buffer）。
- 广播收包采用批量消费，降低上下文切换频率。

## `single-host-relay-model.md`

### 推荐模式

- `Mediator`：Host 作为成员间交互中介者。
- `Router + Strategy`：按消息类型选择不同转发策略。
- `CQRS Lite`：路由写路径与查询路径分离（写转发、读路由表）。

### 优雅性实现要点

- 路由器只处理路由，不处理业务载荷语义。
- 通过接口隔离主机职责：`RelayPort`、`MembershipPort`、`CatalogPort`。

### 性能实现要点

- 路由表使用哈希结构并支持 lock-free 读。
- 广播采用快照遍历，避免持锁遍历全成员。

## `host-election-principles.md`

### 推荐模式

- `Raft-inspired Leader Election`：保留 term、多数票、单任期单票。
- `Lease`：主机租约语义（主动下线优先，被动检测兜底）。
- `Fencing Token`：用 `term/epoch` 防止旧主机写入。

### 优雅性实现要点

- 选举策略与网络 IO 解耦，策略层纯函数化。
- 所有选举决策都可追溯（输入事件 -> 决策输出）。

### 性能实现要点

- 心跳为 10 秒被动检测，降低网络与 CPU 占用。
- 选举只在必要时触发，避免频繁 leader 抖动。

## `host-election-algorithm-appendix.md`

### 推荐模式

- `Event Sourcing Lite`：记录关键选举事件便于重放。
- `Timer Wheel`：管理心跳与选举超时，降低定时器开销。
- `Single Writer`：同一节点内部由单写协程更新选举状态。

### 优雅性实现要点

- 选举状态统一由 `ElectionContext` 持有，避免散乱全局变量。
- 对外只暴露 `onMessage()` 与 `onTick()` 两个驱动入口。

### 性能实现要点

- `term` 更新与投票判定保持 O(1)。
- 并发投票处理阶段仅做轻量判定，重逻辑异步下沉。

## `session-and-transport-contracts.md`

### 推荐模式

- `Protocol Envelope`：统一消息封套。
- `Pipeline`：编码、鉴权、路由、ACK、重试分段处理。
- `Circuit Breaker`：目标节点异常时快速失败。

### 优雅性实现要点

- 传输层不感知业务动作，仅处理会话与投递语义。
- 错误码集中定义，禁止字符串散落。

### 性能实现要点

- 使用对象池与缓冲池减少 GC 压力。
- ACK 与重试分离线程/协程池，避免主收包线程阻塞。

## `plugin-sync-and-runtime-routing.md`

### 推荐模式

- `Repository`：主机插件与规则权威存储抽象。
- `Cache Aside`：成员本地缓存 + 版本校验按需拉取。
- `Saga Lite`：同步与执行跨节点流程的补偿控制。

### 优雅性实现要点

- 插件目录、包分发、规则同步分别建独立应用服务。
- 版本校验逻辑放在统一拦截器，避免重复判断。

### 性能实现要点

- 插件包传输支持分块与并行下载。
- 权威版本索引常驻内存，查询 O(1)。

## `failure-recovery-and-observability.md`

### 推荐模式

- `Bulkhead`：路由、同步、选举三个故障域隔离。
- `Retry with Jitter`：抖动重试避免雪崩。
- `Outbox`：关键状态事件先落盘再投递观测系统。

### 优雅性实现要点

- 故障分类与恢复动作一一映射，避免模糊处理。
- 观测事件结构化，统一字段模板。

### 性能实现要点

- 关键指标异步采集，避免阻塞请求主路径。
- 高频日志采样 + 低频全量，平衡可观测性与性能。

## `rollout-checklist.md`

### 推荐模式

- `Architecture Decision Record`：每项关键决策留痕。
- `Quality Gate`：性能、稳定性、可维护性门禁化。
- `Progressive Hardening`：先跑通主链路，再逐项强化。

### 优雅性实现要点

- 检查项按“架构 -> 实现 -> 验证”顺序组织。
- 每项检查必须对应可执行命令或可验证产物。

### 性能实现要点

- 每次阶段验收必须附带基准数据（时延、吞吐、资源占用）。
- 对性能回归设自动阈值拦截。

## 推荐实现骨架

- `domain/`：实体、值对象、领域服务
- `application/`：用例服务、命令处理、查询处理
- `infrastructure/`：TCP、存储、序列化、日志
- `interfaces/`：API、CLI、事件适配层
- `tests/`：协议测试、状态机测试、故障注入测试、性能基准测试
