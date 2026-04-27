# 设备握手

## 目标

统一定位 `connect/connectAck` 与 probe 握手流程。

## 关键节点

- `SYNRA-COMM::DEVICE_HANDSHAKE::CONNECT::OPEN_TRANSPORT`
- `SYNRA-COMM::DEVICE_HANDSHAKE::CONNECT::INBOUND_ACCEPT`
- `SYNRA-COMM::DEVICE_HANDSHAKE::CONNECT::PROBE_BATCH`
- `SYNRA-COMM::DEVICE_HANDSHAKE::CONNECT::PROBE_SINGLE`
- `SYNRA-COMM::PLUGIN_BRIDGE::RECEIVE::PAIRING_DISCOVERY_RESYNC_AFTER_WIRE`

## 三端映射

- Node.js
  - `packages/capacitor-electron/src/host/services/device-discovery/session/outbound-client-session.ts`
  - `packages/capacitor-electron/src/host/services/device-discovery/session/inbound-host-transport.ts`
  - `packages/capacitor-electron/src/host/services/device-discovery/discovery/probe-runner.ts`
  - `packages/hooks/src/runtime/adapter-listeners.ts`（与 `peer-discovery-after-pairing-wire.ts`）
- Android
  - `packages/capacitor-device-connection/android/src/main/java/com/synra/plugins/deviceconnection/DeviceConnectionPlugin.java`
- iOS
  - `packages/capacitor-device-connection/ios/Sources/DeviceConnectionPlugin/DeviceConnectionPluginCore.swift`
  - `packages/capacitor-device-connection/ios/Sources/DeviceConnectionPlugin/DeviceConnectionPluginCore+SynraInboundTcp.swift`
  - `packages/capacitor-device-connection/ios/Sources/DeviceConnectionPlugin/DeviceConnectionPluginCore+SynraProbe.swift`

## 含义说明

- `OPEN_TRANSPORT`：主连接握手入口。
- `INBOUND_ACCEPT`：服务端收到 connect 后验参与 ack 的位置。
- `PROBE_BATCH/PROBE_SINGLE`：发现阶段短连接握手，不保持业务长连接。
- `PAIRING_DISCOVERY_RESYNC_AFTER_WIRE`：hooks 在 `device.pairing.unpair-required` / `device.pairing.peer-reset` 完成本地解配后，用仍 `ready` 的 inbound 链路把对端重新写入 runtime discovery，避免「只清配对、扫描列表空窗」。

## 与 UI 设备列表的关系

- **未配对设备出现在连接页列表**：仅当 hooks 中 `shouldExposeDiscoveredDevice`（`packages/hooks/src/runtime/discovery-exposure.ts`）成立，即 `source` 为 `probe` 或 `transport`、已 `connectable`、带有效 `connectCheckAt` 且无 `connectCheckError`（Synra TCP 握手证明）。**不**因仅有 mDNS/UDP 候选（`mdns`/`manual`）而展示；该准入在 `discovery-admission.ts` 与可选的 `display-devices-merge.ts` 未配对分支中落实。
- **设备展示名**：来自握手 / `probeSynraPeers` 返回的 `displayName` 或配对存储，**不由** `capacitor-lan-discovery` 的 TXT/UDP 推断。
- **解配 wire 后的扫描列表**：收到 `device.pairing.unpair-required` 或 `device.pairing.peer-reset` 并完成本地解配后，若 inbound TCP 仍打开，hooks 会用链路快照把该 `deviceId` 重新合并进 runtime discovery（`PAIRING_DISCOVERY_RESYNC_AFTER_WIRE`），与「已配对行从配对存储展示、扫描行从 discovery 合并」的 UI 模型一致。
- **已配对设备在 UI 上的主源**：展示名与已解析地址以持久化 `SynraPairedDeviceRecord`（及握手/对方改名写库结果）为准；LAN discovery 仅作在线/连通等提示，`usePairedDevices` 等不得用扫描行覆盖已存展示名与 `lastResolvedHost`/`port`。
