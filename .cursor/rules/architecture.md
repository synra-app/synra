# Architecture Rules

## Monorepo 边界

- `apps/*` 只消费 `packages/*` 暴露的公共 API，不直接依赖包内私有实现。
- `packages/*` 之间依赖尽量单向，避免循环依赖。
- 跨包通信优先通过类型与协议（如 `@synra/protocol`）约束。

## 通信栈约束（V2）

- 对业务层统一暴露三件事：`sendToDevice`、`broadcast`、`onMessage`。
- 保持双插件边界：`LanDiscovery` 负责发现，`DeviceConnection` 负责连接与通信。
- 禁止恢复旧 hooks（如 `useDiscovery` / `useSessionMessages`）到业务层。
- 发现使用 UDP，点对点消息使用 TCP；业务层不得依赖 `sessionId`。
- 需要扩展通信能力时，先在 `useTransport` 契约层设计，再下沉到 runtime/native。

## 配置集中化

- 重复配置优先抽到公共层（例如 `scripts/vite/config.ts`）。
- 包级配置仅保留差异项，避免复制粘贴整段配置。
- `tsconfig` 优先继承根配置，局部差异再覆盖。

## 依赖治理

- 依赖版本优先通过 workspace catalog 统一管理（`catalog:<tag>`）。
- 新增依赖前先确认是否已存在同类能力，避免重复引入。
- 跨包依赖使用 `workspace:*`，避免硬编码内部版本号。

## 变更原则

- 变更应最小化并可回滚，避免一次提交混入无关重构。
- 修改公共协议或核心包时，同时检查受影响包与测试。
