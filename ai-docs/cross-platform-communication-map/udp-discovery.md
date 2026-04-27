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
  - `packages/capacitor-lan-discovery/android/src/main/java/com/synra/plugins/landiscovery/LanDiscoveryPluginPlugin.java` (`discoverByUdp`, UDP responder)
- iOS
  - `packages/capacitor-lan-discovery/ios/Sources/LanDiscoveryPluginPlugin/LanDiscoveryPlugin+NetworkScan.swift` (`discoverByUdp`)
  - `packages/capacitor-lan-discovery/ios/Sources/LanDiscoveryPluginPlugin/LanDiscoveryPlugin+UdpResponder.swift`

## 混合发现时序（Capacitor）

- **Electron**：`discovery-orchestrator` 内 mDNS / UDP / manual 策略 `Promise.all` **并行**。
- **Android / iOS**：`hybrid` 且 `enableProbeFallback` 时，`discoverByMdns` 与 `discoverByUdp` **并行**，合并规则与原先「先 mDNS 再 UDP」一致（同 host 优先保留带 `sourceDeviceId` 的候选）。
- **Hooks / 常量**：`@synra/protocol` 的 `DEFAULT_SYNRA_SCAN_BUDGET_MS`（默认 **2200ms**）与 `synraDiscoveryTimeoutsFromBudget` 将单一 `scanBudgetMs` 拆成原生 mDNS/UDP 窗口与 Synra TCP probe 窗口；`SynraDiscoveryStartOptions` 使用 `scanBudgetMs`（见 `packages/hooks/src/types.ts`）。Capacitor 上原生 `startDiscovery` 仍可做 mDNS/UDP + 可选同进程 `PROBE_BATCH`；**Hooks** 在 `packages/hooks/src/runtime/discovery-module.ts` 中于 `startDiscovery` 之后再次调用 `DeviceConnection.probeSynraPeers`（见 `createCapacitorRuntimeAdapter`），以便与 `discovery-admission` / `discovery-exposure` 的「仅握手证明可进 peers」规则对齐。

## 含义说明

- Node.js 负责 UDP 广播发现与响应；Android/iOS 在混合模式下用 UDP 作为 mDNS 的补充，并各自实现 UDP responder 以对 `SYNRA_DISCOVERY_V1` 请求回复 JSON（**最小字段**：`appId`、`protocolVersion`、`port` 默认 Synra TCP 端口、`sourceDeviceId`；**不含**业务展示名）。
- **`capacitor-lan-discovery` 边界**：LAN 层只产出 **IPv4** 与关联键（如 `sourceDeviceId`）；**不在插件内**解析或下发 `displayName`、系统主机名等展示语义；展示名与列表准入在 **hooks**（`SYNRA-COMM::PLUGIN_BRIDGE` 域）与握手结果中处理。
