# 通讯层重构方向：从 useSynraEnvelope 到 useSynraSystemEnvelope / useSynraPluginEnvelope

本文记录 **Synra 跨端通讯** 的长期重构方向：业务侧 **不再维护多套并行收发入口**，逐步 **完全迁移** 到以 **`useSynraSystemEnvelope`（系统）/ `useSynraPluginEnvelope`（插件）** 为**日常对外**形态；**底层**统一由 **`useSynraEnvelope`** 实现真实 `send` / `subscribe` / `request`（`event` 为**线上一真名**）。`useSynraSystemEnvelope` / `useSynraPluginEnvelope` 与 `useSynraEnvelope` 的差异仅为 **给 `event` 自动加/去前缀**（详见 [plugin-system/10-synra-envelope-hooks-and-prefixes.md](../plugin-system/10-synra-envelope-hooks-and-prefixes.md)），不引入单独的 system / plugin 类型或 `channel` 字段。底层仍遵守 [消息信封白名单](../cross-platform-communication-map/message-envelope-and-validation.md)，不擅自增加线上一帧字段。信封解析、前缀与路由见 **`@synra/envelope`**。

> 与实现计划（含 Electron 主↔渲 **仅方案 B** 等）配套：见工作区 `.cursor/plans` 中相关计划；代码级规范仍以 `SYNRA-COMM` 注释与 `ai-docs/cross-platform-communication-map` 为准。

## 重构要做什么（简述）

1. **统一入口**：产品代码优先用 `useSynraSystemEnvelope` 或 `useSynraPluginEnvelope`；**必须**直控线名时用 `useSynraEnvelope`。
2. **移除并行路径**：删除或私有化 **store / composable 上直接暴露的 `sendLanEvent`、零散订阅**，避免「同一语义两套 API」。
3. **Electron 宿主**：主进程 ↔ 渲染进程侧 **仅保留**「专用 IPC + 白名单信封」一条路（方案 B），与发现广播等旧通道 **分阶段** 收敛或拆除（不在单 PR 强求一次删光底层 native，但 **对外调用形态** 以唯一为准）。
4. **移动端**：Capacitor iOS/Android 上与宿主推送能对齐的 **尽量合并进** 连接层 `onMessage`；缺口在原生侧补发，仍走信封白名单。
5. **系统 / 插件事件命名**：不增加信封字段；在 **`event` 字符串**上用 **`_synra.`** 与 **`_plugin.{slug}.`** 区分（与 hooks 中 `useSynraSystemEnvelope` / `useSynraPluginEnvelope` 一致）；说明见 [10-synra-envelope-hooks-and-prefixes.md](../plugin-system/10-synra-envelope-hooks-and-prefixes.md)。

## 涉及代码（便于检索，非穷举）

| 区域              | 路径/说明                                                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 运行时与适配器    | `packages/hooks/src/runtime/resolve-adapter.ts`、`adapters/capacitor-adapter.ts`、`adapters/electron-main-adapter.ts`                                                                                   |
| 连接运行时 / 发送 | `packages/hooks/src/runtime/create-connection-runtime.ts`、`transport-operations-module.ts`；业务发消息经 `use-synra-envelope.ts` / `use-synra-system-envelope.ts`，`use-transport.ts` 仅发现与连接编排 |
| 收包 / 订阅       | `packages/hooks/src/runtime/adapter-listeners.ts`、`lan-wire-listeners.ts`、`create-connection-runtime.ts`（连接层 `onMessage`）                                                                        |
| 信封三层          | `packages/envelope/src/**`、`packages/hooks/src/envelope/use-synra-envelope.ts`、`use-synra-system-envelope.ts`、`use-synra-plugin-envelope.ts`                                                         |
| Electron 应用     | `apps/electron/src/main.ts`（`__synraHooksMainBridge`、`BRIDGE_HOST_EVENT_CHANNEL`）、`apps/electron/src/preload.ts`                                                                                    |
| Capacitor 桥      | `packages/capacitor-electron/src/bridge/**`、`packages/capacitor-device-connection/**`（原生与 Electron 实现）                                                                                          |
| 前端业务          | `apps/frontend/src/composables/use-connect-page.ts`、`PairingRequestDialog.vue` 等使用 `useSynraSystemEnvelope().send`；`useLanDiscoveryStore` 不再暴露 `sendLanEvent`                                  |
| 协议与信封        | `packages/protocol`、`ai-docs/cross-platform-communication-map/message-envelope-and-validation.md`                                                                                                      |

后续实施与拆旧进展可在此 README **追加小节**（例如「已迁移模块」「仍待拆除入口」），保持简短即可。

## 已迁移模块 / 已拆除入口（落地）

- **前端**：`apps/frontend/src/composables/use-device-basic-info.ts` 对已连接链路广播展示名时使用 `useSynraSystemEnvelope().send`（`DEVICE_DISPLAY_NAME_CHANGED_EVENT`）；`apps/frontend/src/stores/lan-discovery.ts` 仅 re-export 发现与连接编排（`peers`、`openTransportLinks`、`ensureReady`、`startScan`、`connectToDevice`、`connectToDeviceAt`、`disconnectDevice` 等），不再暴露 `sendConnectionMessage` / `onSynraMessage` / `broadcastDeviceProfileToOpenTransportLinks`。
- **hooks**：`packages/hooks/src/hooks/use-transport.ts` 收敛为仅发现 + 连接；收发统一走 `useSynraSystemEnvelope` / `useSynraPluginEnvelope` / `useSynraEnvelope`。`@synra/hooks` 公开导出已移除若干仅服务于旧并行 API 的类型（`SendMessageToReadyDeviceInput`、`TransportBroadcastMessageInput`、`SynraConnection*` 等与连接消息相关的对外类型）；运行时内部类型仍留在 `packages/hooks/src/types.ts`。
- **`pullHostEvents` 全栈拆除**：已从 `packages/capacitor-electron`（协议常量、`connectionService`、`device-discovery.service`、`bridge` handler、runtime capabilities、`host-event-bus` 的队列 drain）、`packages/capacitor-device-connection`（definitions、web、electron 实现）、Android `DeviceConnectionPlugin.java`、iOS `DeviceConnectionPluginPlugin.swift` 移除；宿主事件仅以实时通道推送，不做 pull 回放。
