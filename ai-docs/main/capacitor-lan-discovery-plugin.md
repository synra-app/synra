# `@synra/capacitor-lan-discovery` 实现说明（重构后）

整理日期：2026-04-18

## 目标

- 将内网设备搜索能力收敛为一个 Capacitor 插件包，放置于 `packages/capacitor-lan-discovery`。
- 对上层应用暴露统一 API，不让业务页面直接依赖 Electron 桥接细节。
- 第一版采用混合策略：`mDNS` 优先，手动 IP + 受控探测作为兜底。

## 插件 API（当前）

- `startDiscovery(options)`
- `stopDiscovery()`
- `getDiscoveredDevices()`
- `pairDevice(options)`
- `probeConnectable(options)`
- `openSession(options)`
- `closeSession(options)`
- `sendMessage(options)`（`messageType + payload`）
- `getSessionState(options)`
- `pullHostEvents()`

## 事件模型（当前）

- `deviceFound`
- `deviceUpdated`
- `deviceLost`
- `scanStateChanged`
- `sessionOpened`
- `sessionClosed`
- `messageReceived`
- `messageAck`
- `transportError`
- `hostEvent`（Electron 调试通道）

## 分层实现

### 1) 插件层（packages）

- 插件入口：`packages/capacitor-lan-discovery/src/index.ts`
- 类型契约：`packages/capacitor-lan-discovery/src/definitions.ts`
- Web fallback：`packages/capacitor-lan-discovery/src/web.ts`
- Electron 适配：`packages/capacitor-lan-discovery/src/electron.ts`

### 2) Electron 桥接层（当前）

- 新增 bridge method：
  - `discovery.start`
  - `discovery.stop`
  - `discovery.list`
  - `discovery.pair`
  - `discovery.probeConnectable`
  - `discovery.openSession`
  - `discovery.closeSession`
  - `discovery.sendMessage`
  - `discovery.getSessionState`
  - `discovery.pullHostEvents`
- 主要文件：
  - `packages/capacitor-electron/src/shared/protocol/constants.ts`
  - `packages/capacitor-electron/src/shared/protocol/types.ts`
  - `packages/capacitor-electron/src/bridge/main/handlers.ts`
  - `packages/capacitor-electron/src/host/services/device-discovery.service.ts`

### 3) 应用接入层（frontend）

- store：`apps/frontend/src/stores/lan-discovery.ts`
- 页面：`apps/frontend/src/pages/index.vue`
- `main.ts` 接入 Pinia。

## 当前行为边界

- Electron discovery service 已落地基础稳态能力：
  - 帧长度上限保护（拒绝超大帧）
  - socket 写队列与 `drain` 背压控制
  - ACK 超时重试（短退避）
  - `transport.*` host event 统一语义
- Android / iOS 已对齐消息字段：`messageType + payload`。
- iOS 已补充消息接收事件透传（message/ack/close/error）。
- Web 端仍为 no-op fallback（只用于构建与轻量调试）。

## 验收建议（当前）

- Electron 下执行：
  1. 开始扫描可返回设备列表。
  2. 手动 IP 可进入候选设备列表。
  3. Pair 后设备状态变更为 `paired`。
  4. 停止扫描后状态回到 `idle`。
  5. 发送消息可拿到 ACK，ACK 超时会重试并最终上报错误。

- 前端页面：
  1. 能展示扫描状态、设备列表、配对状态。
  2. 错误信息可见（例如 pair 不存在设备时）。
  3. 日志包含 `messageSent/messageReceived/messageAck/transportError`。
