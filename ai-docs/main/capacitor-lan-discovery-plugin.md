# `@synra/capacitor-lan-discovery` 实现说明（MVP）

整理日期：2026-04-18

## 目标

- 将内网设备搜索能力收敛为一个 Capacitor 插件包，放置于 `packages/capacitor-lan-discovery`。
- 对上层应用暴露统一 API，不让业务页面直接依赖 Electron 桥接细节。
- 第一版采用混合策略：`mDNS` 优先，手动 IP + 受控探测作为兜底。

## 插件 API

- `startDiscovery(options)`
- `stopDiscovery()`
- `getDiscoveredDevices()`
- `pairDevice(options)`

## 事件模型

- `deviceFound`
- `deviceUpdated`
- `deviceLost`
- `scanStateChanged`

## 分层实现

### 1) 插件层（packages）

- 插件入口：`packages/capacitor-lan-discovery/src/index.ts`
- 类型契约：`packages/capacitor-lan-discovery/src/definitions.ts`
- Web fallback：`packages/capacitor-lan-discovery/src/web.ts`
- Electron 适配：`packages/capacitor-lan-discovery/src/electron.ts`

### 2) Electron 桥接层

- 新增 bridge method：
  - `discovery.start`
  - `discovery.stop`
  - `discovery.list`
  - `discovery.pair`
- 主要文件：
  - `packages/capacitor-electron/src/shared/protocol/constants.ts`
  - `packages/capacitor-electron/src/shared/protocol/types.ts`
  - `packages/capacitor-electron/src/bridge/main/handlers.ts`
  - `packages/capacitor-electron/src/host/services/device-discovery.service.ts`

### 3) 应用接入层（frontend）

- store：`apps/frontend/src/stores/lan-discovery.ts`
- 页面：`apps/frontend/src/pages/index.vue`
- `main.ts` 接入 Pinia。

## 当前行为边界（MVP）

- 当前 Electron 发现服务是最小可用实现，提供统一设备模型和 API 流程闭环。
- 真实 mDNS/原生扫描仍需在 Android/iOS 原生层补齐（目录已预留骨架）。
- Web 端默认 no-op fallback，确保构建与本地调试不被中断。

## 验收建议

- Electron 下执行：
  1. 开始扫描可返回设备列表。
  2. 手动 IP 可进入候选设备列表。
  3. Pair 后设备状态变更为 `paired`。
  4. 停止扫描后状态回到 `idle`。

- 前端页面：
  1. 能展示扫描状态、设备列表、配对状态。
  2. 错误信息可见（例如 pair 不存在设备时）。
