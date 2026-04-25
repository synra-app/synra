# 消息信封与校验

## 目标

统一定位消息信封编解码、事件路由与发送参数校验。

## 关键节点

- `SYNRA-COMM::MESSAGE_ENVELOPE::SEND::FRAME_CODEC`
- `SYNRA-COMM::MESSAGE_ENVELOPE::RECEIVE::FRAME_CODEC`
- `SYNRA-COMM::MESSAGE_ENVELOPE::RECEIVE::LAN_EVENT_ROUTE`
- `SYNRA-COMM::MESSAGE_ENVELOPE::SEND::SEND_MESSAGE_VALIDATE`
- `SYNRA-COMM::MESSAGE_ENVELOPE::SEND::SEND_LAN_EVENT_VALIDATE`
- `SYNRA-COMM::TCP::ACK::MESSAGE_ACK_AUTO`

## 三端映射

- Node.js
  - `packages/capacitor-electron/src/host/services/device-discovery/protocol/lan-frame.codec.ts`
  - `packages/capacitor-electron/src/host/services/device-discovery/session/outbound-client-session.ts`
  - `packages/capacitor-electron/src/host/services/device-discovery/session/inbound-host-transport.ts`
  - `packages/capacitor-electron/src/shared/schema/validators.ts`
- Android
  - `packages/capacitor-device-connection/android/src/main/java/com/synra/plugins/deviceconnection/DeviceConnectionPlugin.java`
- iOS
  - `packages/capacitor-device-connection/ios/Sources/DeviceConnectionPlugin/DeviceConnectionPluginCore.swift`
  - `packages/capacitor-device-connection/ios/Sources/DeviceConnectionPlugin/DeviceConnectionPluginCore+SynraInboundTcp.swift`

## 信封字段白名单

只允许：

- `requestId`
- `event`
- `target`
- `from`
- `replyRequestId`
- `payload`
- `timestamp`

扩展字段需先确认，禁止隐式双写兼容。

