# `@synra/capacitor-device-connection` 实现说明

整理日期：2026-04-19

## 定位

- `@synra/capacitor-device-connection` 负责设备会话连接与消息收发。
- 当前仅实现 `tcp`，但接口已预留 `transport` 字段用于后续扩展。
- 前端与插件侧统一通过 `@synra/hooks` 的 `useConnection()` 调用本插件能力，不再各自拼装事件链路。

## 插件 API（当前）

- `openSession(options)`
- `closeSession(options)`
- `sendMessage(options)`
- `getSessionState(options)`
- `pullHostEvents()`

## 关键类型约定

- `transport`：当前固定为 `tcp`。
- `sessionState`：`idle | connecting | open | closed | error`。
- 所有会话方法均支持/返回 `transport` 字段，保证多连接方案可扩展。

## 事件模型（当前）

- `sessionOpened`
- `sessionClosed`
- `messageReceived`
- `messageAck`
- `transportError`
- `hostEvent`

## 与 `@synra/hooks` 的关系

- `@synra/hooks` 负责：
  - 统一 `sendMessage / onMessage` API
  - 连接事件回放与去重
  - renderer 侧主进程桥接后的一致消费
- `@synra/capacitor-device-connection` 继续聚焦底层连接插件契约，不承担前端状态聚合。

## Electron 桥接（连接）

- `connection.openSession`
- `connection.closeSession`
- `connection.sendMessage`
- `connection.getSessionState`
- `connection.pullHostEvents`

## Host 侧实现

- `packages/capacitor-electron/src/host/services/connection.service.ts`
- `packages/capacitor-electron/src/host/services/connection-adapter.registry.ts`

当前 `connection.service` 通过 `ConnectionAdapterRegistry` 选择适配器，首版注册 TCP 适配器（基于现有 discovery service 的 TCP 会话能力）。
