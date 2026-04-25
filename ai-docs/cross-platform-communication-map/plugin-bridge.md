# Plugin Bridge

## 目标

统一定位前端调用入口到宿主桥接层的通讯节点。

## 关键节点

- `SYNRA-COMM::PLUGIN_BRIDGE::SEND::IPC_INVOKE_REQUEST`
- `SYNRA-COMM::PLUGIN_BRIDGE::SEND::CONNECTION_SEND_MESSAGE_VALIDATE`
- `SYNRA-COMM::PLUGIN_BRIDGE::SEND::CONNECTION_SEND_LAN_EVENT_VALIDATE`
- `SYNRA-COMM::PLUGIN_BRIDGE::CONNECT::HOOK_OPEN_TRANSPORT`
- `SYNRA-COMM::PLUGIN_BRIDGE::CLOSE::HOOK_CLOSE_TRANSPORT`
- `SYNRA-COMM::PLUGIN_BRIDGE::SEND::HOOK_SEND_MESSAGE`
- `SYNRA-COMM::PLUGIN_BRIDGE::SEND::HOOK_SEND_LAN_EVENT`
- `SYNRA-COMM::PLUGIN_BRIDGE::CONNECT::UI_CONNECT_TO_DEVICE`

## 映射

- Bridge/校验
  - `packages/capacitor-electron/src/bridge/preload/invoke.ts`
  - `packages/capacitor-electron/src/shared/schema/validators.ts`
- Hooks 运行时
  - `packages/hooks/src/runtime/transport-operations-module.ts`
  - `packages/hooks/src/hooks/use-transport.ts`
- 前端页面入口
  - `apps/frontend/src/composables/use-connect-page.ts`

## 含义说明

- Bridge 节点用于定位 IPC 请求与参数校验位置。
- Hook/UI 节点用于定位“业务入口 -> 传输调用”的起点。

