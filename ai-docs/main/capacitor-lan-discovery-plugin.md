# `@synra/capacitor-lan-discovery` 实现说明（发现专用）

整理日期：2026-04-19

## 定位

- `@synra/capacitor-lan-discovery` 仅负责设备扫描、发现、配对与可达性探测。
- 连接、会话、消息收发已拆分到 `@synra/capacitor-device-connection`。

## 插件 API（当前）

- `startDiscovery(options)`
- `stopDiscovery()`
- `getDiscoveredDevices()`
- `pairDevice(options)`
- `probeConnectable(options)`

## 事件模型（当前）

- `deviceFound`
- `deviceUpdated`
- `deviceLost`
- `scanStateChanged`
- `deviceConnectableUpdated`

## 分层实现

- 插件入口：`packages/capacitor-lan-discovery/src/index.ts`
- 类型契约：`packages/capacitor-lan-discovery/src/definitions.ts`
- Web fallback：`packages/capacitor-lan-discovery/src/web.ts`
- Electron 适配：`packages/capacitor-lan-discovery/src/electron.ts`
- Android 实现：`packages/capacitor-lan-discovery/android/src/main/java/com/synra/plugins/landiscovery/LanDiscoveryPluginPlugin.java`

## Electron 桥接（发现）

- `discovery.start`
- `discovery.stop`
- `discovery.list`
- `discovery.pair`
- `discovery.probeConnectable`

## 说明

- 发现插件不再承载任何会话生命周期。
- 需要会话收发能力时，请使用连接插件，并通过 `connection.*` bridge 方法调用。
