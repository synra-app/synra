# 主机选举算法附录（草案）

## 目标

给出可直接实现的自动选主算法草案，适配单主机中继模型。

## 节点本地状态

每个节点维护：

- `currentTerm: number`
- `votedFor: nodeId | null`
- `role: host | member | candidate`
- `lastHeartbeatAt: number`
- `knownHostId: nodeId | null`
- `knownEpoch: number`

## 关键定时器

- `heartbeatIntervalMs`：主机发送心跳周期（建议固定 10000ms）。
- `electionTimeoutMs`：成员等待主机心跳超时（建议随机 20000ms~30000ms）。
- `failoverGraceMs`：新主机接管前短暂等待窗口（建议 200ms~500ms）。

## 消息定义

- `heartbeat(term, epoch, hostId)`
- `host.retire(term, hostId, retireAt)`
- `vote.request(term, candidateId, candidateEpochHint)`
- `vote.response(term, voterId, granted)`
- `election.win(term, hostId, epoch)`
- `host.announce(term, hostId, epoch)`

## 心跳规则

- 仅主机发送 `heartbeat`。
- 成员接收心跳后刷新 `lastHeartbeatAt` 与 `knownHostId`。
- 心跳 `term` 小于本地 `currentTerm` 时忽略并返回 `TERM_OUTDATED`。
- 心跳只用于被动健康检测，不作为主机切换首选触发器。

## 主动下线规则

- 主机计划下线时，优先广播 `host.retire`，并携带 `retireAt`。
- 成员收到 `host.retire` 后立即启动选举准备，不等待心跳超时。
- 成员节点计划下线时，先发送 `session.close` 给主机，再关闭本地会话。

## 发起选举

成员在 `now - lastHeartbeatAt > electionTimeoutMs` 时：

1. `role` 切换为 `candidate`。
2. `currentTerm += 1`。
3. `votedFor = self`。
4. 广播 `vote.request`。
5. 启动本轮选举计时器。

## 投票规则

节点收到 `vote.request` 时：

1. 若请求 `term < currentTerm`，拒绝投票。
2. 若请求 `term > currentTerm`，更新本地 `currentTerm` 并清空 `votedFor`。
3. 若 `votedFor` 为空或已投同一候选者，投票通过并写入 `votedFor`。
4. 在同一 `term` 对不同候选者重复请求一律拒绝。

## 当选规则

候选者在当前 `term` 收到超过半数 `granted=true` 投票时：

1. `role = host`。
2. `knownHostId = self`。
3. `knownEpoch += 1`。
4. 发送 `election.win` 与 `host.announce`。
5. 等待 `failoverGraceMs` 后开放中继写入。

## 失败与重试

- 候选者在超时前未获多数票：进入下一轮选举，`term += 1`。
- 候选者收到更高 `term` 心跳或公告：立即降级为 `member`。
- 网络分区恢复后，低 `term` 主机必须降级为 `member`。

## 接管流程

```mermaid
flowchart LR
  hostLost[HostHeartbeatTimeout] --> startElection[StartElection]
  startElection --> votePhase[VotePhase]
  votePhase -->|majorityGranted| winElection[WinElection]
  votePhase -->|timeoutOrNoMajority| nextTerm[NextTermElection]
  winElection --> announceHost[AnnounceNewHost]
  announceHost --> rebuildRoutes[RebuildRoutesAndSessions]
  rebuildRoutes --> resumeRelay[ResumeRelay]
```

## 脑裂防护

- 成员只认同最高 `term` 的 `host.announce`。
- 同 `term` 多主公告时按确定性规则只接受一个主机。
- 旧主机恢复后若 `term` 过期，必须放弃主机身份。

## 幂等与恢复

- `election.win` 与 `host.announce` 需幂等处理。
- 主机切换期间请求进入挂起队列，接管后按 `messageId` 去重重放。
- 超过恢复窗口的挂起请求返回 `HOST_FAILOVER_ABORTED`。

## 参数建议

- 小规模 LAN（<=10 节点）：`heartbeatIntervalMs=10000`，`electionTimeoutMs=20000~26000`。
- 中规模 LAN（<=50 节点）：`heartbeatIntervalMs=10000`，`electionTimeoutMs=24000~30000`。
- 高抖动网络建议扩大 `electionTimeoutMs` 随机窗口，降低并发竞选概率。
