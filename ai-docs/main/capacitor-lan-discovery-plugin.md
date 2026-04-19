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

### `startDiscovery` 关键参数（新增）

- `discoveryMode`：`hybrid | mdns | subnet | manual`
- `subnetCidrs`：可选，指定受控子网（例如 `192.168.1.0/24`）
- `maxProbeHosts`：子网探测候选上限，避免大范围扫描
- `concurrency`：探测并发度（当前主要用于 Electron）
- `discoveryTimeoutMs`：扫描阶段时间预算（当前主要用于 Electron）

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
- 设备发现策略已调整为混合模式：
  - `hybrid`：mDNS 源 + 手动目标 + 受控子网探测候选
  - `subnet`：仅子网候选 + 手动目标
  - `manual`：仅手动目标
  - `mdns`：仅 mDNS 源（当前以网卡地址源为主）
- 子网探测从“单个相邻 IP”升级为“CIDR 范围候选 + 上限控制”。
- Android / iOS 已对齐消息字段：`messageType + payload`。
- iOS 已补充消息接收事件透传（message/ack/close/error），并补齐 IPv4 网卡枚举。
- Web 端仍为 fallback，但会保留手动目标并返回 `CAPABILITY_UNAVAILABLE_ON_WEB` 连接检查错误，避免误判为“无设备”。

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
