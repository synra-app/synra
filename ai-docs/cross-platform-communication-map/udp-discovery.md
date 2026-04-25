# UDP 发现

## 目标

统一定位发现广播、发现响应和离线广播路径。

## 关键节点

- `SYNRA-COMM::UDP_DISCOVERY::CONNECT::DISCOVERY_SCAN`
- `SYNRA-COMM::UDP_DISCOVERY::SEND::DISCOVERY_BROADCAST`
- `SYNRA-COMM::UDP_DISCOVERY::RECEIVE::DISCOVERY_RESPONSE`
- `SYNRA-COMM::UDP_DISCOVERY::SEND::OFFLINE_ANNOUNCEMENT`
- `SYNRA-COMM::UDP_DISCOVERY::RECEIVE::UDP_RESPONDER`

## 三端映射

- Node.js
  - `packages/capacitor-electron/src/host/services/device-discovery/discovery/strategies/udp.strategy.ts`
  - `packages/capacitor-electron/src/host/services/device-discovery/session/inbound-host-transport.ts`
- Android
  - 当前无 UDP 发现实现（仅 TCP probe）。
- iOS
  - 当前无 UDP 发现实现（仅 TCP probe）。

## 含义说明

- Node.js 负责 UDP 广播发现与响应。
- Android/iOS 在当前实现中通过 TCP probe 参与发现阶段，不承载 UDP 逻辑。

