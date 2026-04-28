# 跨端通讯注释索引

本文档用于统一 Node.js / Android / iOS 的通讯逻辑定位方式。

## 统一注释规则

- 前缀：`SYNRA-COMM::<Domain>::<Stage>::<NodeId>`
- Domain：`TCP`、`UDP_DISCOVERY`、`DEVICE_HANDSHAKE`、`PLUGIN_BRIDGE`、`MESSAGE_ENVELOPE`
- Stage：`CONNECT`、`SEND`、`RECEIVE`、`ACK`、`HEARTBEAT`、`CLOSE`、`ERROR`
- 约束：同一逻辑节点在三端必须复用同一 `Domain/Stage/NodeId`

## 常用 NodeId

- `OPEN_TRANSPORT`
- `PROBE_SINGLE`
- `INBOUND_ACCEPT`
- `OUTBOUND_RECV_LOOP`
- `LAN_EVENT_ROUTE`
- `MESSAGE_SEND`
- `TRANSPORT_CLOSE`
- `TRANSPORT_HEARTBEAT`
- `TRANSPORT_ERROR`
- `PAIRING_DISCOVERY_RESYNC_AFTER_WIRE`（PLUGIN_BRIDGE / RECEIVE；hooks 解配 wire 后补回 discovery）
- `SYNRA_ENVELOPE_RUNTIME_SURFACE`（MESSAGE_ENVELOPE / CONNECT）
- `SYNRA_EVENT_POST_ROUTE`（MESSAGE_ENVELOPE / SEND；`resolveSynraPostTransport`（`@synra/envelope`）；应用层业务发系统/插件事件优先经 `useSynraEvent` / `useSynraPluginEvent`，不再经由已收敛的 `useTransport` 并行消息 API）
- `SYNRA_ENVELOPE_POST`（MESSAGE_ENVELOPE / SEND）
- `SYNRA_ENVELOPE_SUBSCRIBE`（MESSAGE_ENVELOPE / RECEIVE）
- `USE_SYNRA_EVENT_POST`（MESSAGE_ENVELOPE / SEND）
- `ELECTRON_HOST_ENVELOPE_IPC`（MESSAGE_ENVELOPE / SEND；Electron `apps/electron` 方案 B）

## 使用流程

1. 先在本目录按功能域选择文档。
2. 找到目标逻辑节点的 `Domain/Stage/NodeId`。
3. 全仓搜索 `SYNRA-COMM::<Domain>::<Stage>::<NodeId>`。
4. 同步修改 Node.js / Android / iOS 命中的实现点。

## 功能域文档

- `tcp-transport.md`
- `udp-discovery.md`
- `device-handshake.md`
- `plugin-bridge.md`
- `message-envelope-and-validation.md`

## 相关扩展

- [大对象分块传输与会话封装](../file-transfer/README.md)（`FILE_TRANSFER` 建议与 `SYNRA-COMM` 节点对齐时见该目录说明）
