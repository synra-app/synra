# `@synra/hooks` 重构迁移说明

整理日期：2026-04-19

## 目标

- 统一通讯 API 为：
  - `const { sendMessage, onMessage } = useConnection()`
- 自动区分运行环境（electron renderer / capacitor / web noop；main 进程需要显式注入 adapter）。
- 移除 `@synra/plugin-sdk/hooks` 自身 hooks 实现，改为全量转导出 `@synra/hooks`。

## 新包与出口

- 新包：`@synra/hooks`
- 子路径：`@synra/hooks/connection`
- 统一出口保留：`@synra/plugin-sdk/hooks`（内部仅 re-export）

## 迁移结果

- `packages/plugin-sdk/src/hooks` 旧实现已删除。
- `packages/plugin-sdk/src/hooks/index.ts` 改为 `export * from '@synra/hooks'`。
- frontend 移除 `plugin-sdk-hooks-adapter` 注入链路。
- frontend `store` 与 capability port 直接通过 `@synra/hooks` 调用连接运行时。

## 使用示例

```ts
import { useConnection } from '@synra/hooks'

const { sendMessage, onMessage, ensureListeners } = useConnection()
await ensureListeners()

const dispose = onMessage((message) => {
  console.log(message.sessionId, message.messageType, message.payload)
})

await sendMessage({
  sessionId: 'session-1',
  messageType: 'custom.chat.text',
  payload: 'hello'
})

dispose()
```

## 说明

- 本次为一次性重构，不保留旧版 hooks 兼容层。
- 若需要在 electron main 进程使用 hooks，请通过 `configureHooksRuntime` 注入自定义 adapter。
