# 设备握手

## 目标

统一定位 `connect/connectAck` 与 probe 握手流程。

## 关键节点

- `SYNRA-COMM::DEVICE_HANDSHAKE::CONNECT::OPEN_TRANSPORT`
- `SYNRA-COMM::DEVICE_HANDSHAKE::CONNECT::INBOUND_ACCEPT`
- `SYNRA-COMM::DEVICE_HANDSHAKE::CONNECT::PROBE_BATCH`
- `SYNRA-COMM::DEVICE_HANDSHAKE::CONNECT::PROBE_SINGLE`

## 三端映射

- Node.js
  - `packages/capacitor-electron/src/host/services/device-discovery/session/outbound-client-session.ts`
  - `packages/capacitor-electron/src/host/services/device-discovery/session/inbound-host-transport.ts`
  - `packages/capacitor-electron/src/host/services/device-discovery/discovery/probe-runner.ts`
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

