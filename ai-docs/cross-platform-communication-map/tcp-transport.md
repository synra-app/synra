# TCP 传输

## 目标

统一定位 TCP 连接建立、读写循环、关闭与心跳。

## 关键节点

- `SYNRA-COMM::TCP::CONNECT::INBOUND_LISTEN`
- `SYNRA-COMM::TCP::RECEIVE::OUTBOUND_RECV_LOOP`
- `SYNRA-COMM::TCP::RECEIVE::INBOUND_RECV_LOOP`
- `SYNRA-COMM::TCP::SEND::FRAME_WRITE`
- `SYNRA-COMM::TCP::SEND::MESSAGE_SEND`
- `SYNRA-COMM::TCP::SEND::LAN_EVENT_SEND`
- `SYNRA-COMM::TCP::CLOSE::TRANSPORT_CLOSE`
- `SYNRA-COMM::TCP::HEARTBEAT::TRANSPORT_HEARTBEAT`

## 三端映射

- Node.js
  - `packages/capacitor-electron/src/host/services/device-discovery/session/outbound-client-session.ts`
  - `packages/capacitor-electron/src/host/services/device-discovery/session/inbound-host-transport.ts`
  - `packages/capacitor-electron/src/host/services/device-discovery/protocol/lan-frame.codec.ts`
- Android
  - `packages/capacitor-device-connection/android/src/main/java/com/synra/plugins/deviceconnection/DeviceConnectionPlugin.java`
- iOS
  - `packages/capacitor-device-connection/ios/Sources/DeviceConnectionPlugin/DeviceConnectionPluginCore.swift`
  - `packages/capacitor-device-connection/ios/Sources/DeviceConnectionPlugin/DeviceConnectionPluginCore+SynraInboundTcp.swift`

## 含义说明

- `INBOUND_LISTEN`：入站 TCP 监听入口。
- `OUTBOUND_RECV_LOOP`：出站连接持续接收循环。
- `INBOUND_RECV_LOOP`：入站连接持续接收循环。
- `FRAME_WRITE`：长度前缀 JSON 帧写出点。
- `TRANSPORT_CLOSE`：主动/被动关闭汇合点。
- `TRANSPORT_HEARTBEAT`：心跳发送或超时检查点。

