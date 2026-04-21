# 传输契约（V2 Full Break）

## 目标

通信栈只保留三件事能力，并在所有端保持同一语义：

1. `sendToDevice(deviceId, payload)`
2. `broadcast(payload)`
3. `onMessage(handler)`

## 分层职责

- `LanDiscovery`（UDP）：设备发现、上下线广播（含 `deviceLost`）。
- `DeviceConnection`（TCP）：点对点消息传输与实时双向收发。
- 前端/插件层不得直接依赖底层 `sessionId`、`ack`、`reconnect` 等旧模型。

## 标准消息信封

- `messageId`：消息唯一 ID（建议 UUID）。
- `fromDeviceId`：发送端设备 ID。
- `toDeviceId`：目标设备 ID（广播可省略）。
- `channel`：业务通道（如 `chat.message`）。
- `body`：业务载荷。
- `timestamp`：发送时间（毫秒）。

> 说明：`sessionId` 属于底层传输细节，不再作为对外契约字段。

## 运行约束

- 幂等：同一 `messageId` 的重复包只能交付一次。
- 可达性：`sendToDevice` 仅在设备可达时尝试建立/复用连接并发送。
- 广播语义：`broadcast` 以当前可见 peer 集合为目标，逐个发送。
- 故障处理：发送失败返回错误，由上层决定重试策略。

## 可观测事件（推荐）

- `transport.peer.discovered`
- `transport.peer.lost`
- `transport.message.received`
- `transport.message.send.failed`

## 弃用项（仅针对业务层）

- `useDiscovery` / `useConnectionState` / `useSessionMessages`
- 面向业务层直接暴露 `sessionId` 的通信 API
