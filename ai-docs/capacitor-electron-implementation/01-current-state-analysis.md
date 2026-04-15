# 01 当前状态分析

## 分析范围

- `packages/capacitor-electron/package.json`
- `packages/capacitor-electron/src/index.ts`
- `packages/capacitor-electron/tests/index.test.ts`
- `packages/capacitor-electron/tsconfig.json`
- `packages/capacitor-electron/vite.config.ts`

## 当前脚手架结论

`packages/capacitor-electron` 目前是一个标准 Vite+ TypeScript 库模板，尚未包含 Capacitor/Electron 相关能力。

### 已有资产（可复用）

- **构建链路**：`vp pack` + `exports` 已具备库发布基础。
- **测试入口**：`vp test` 已连通，可作为后续单测入口。
- **类型检查基础**：`strict`、`nodenext`、`typeAware lint` 已开启。
- **ESM 方向**：`type: module` 与现代 Electron 生态兼容性更好。

### 当前缺口（必须补齐）

- **无 Capacitor API 契约**：没有 `registerPlugin` 和类型定义。
- **无 Electron 运行时桥接**：缺少 `preload`/`ipcMain`/`ipcRenderer` 协作层。
- **无安全边界**：没有 context isolation 下的暴露策略与白名单机制。
- **无分层目录**：`src/index.ts` 只有示例函数，无法承载真实能力。
- **测试覆盖不足**：仅示例断言，不包含协议、错误、并发、性能场景。

## 现状风险

- 直接在当前空壳上堆功能，容易形成“调用链可跑但结构混乱”的技术债。
- 若不先定义桥接协议，后续 Electron 升级会导致 API 与 IPC 双向破坏性变更。
- 若不提前定义性能预算，IPC 调用频率与序列化成本会在业务放量后成为瓶颈。

## 建议改造方向

### 第一阶段：从“模板库”转为“协议库”

- 建立统一的请求/响应模型（含错误码）。
- 固化 channel 命名规范与版本协商机制。
- 把 `index.ts` 改为 API 暴露层，而不是逻辑层。

### 第二阶段：补齐 Electron 侧宿主能力

- 设计主进程 handler 注册器。
- 将能力实现收敛到服务层，避免在 handler 中堆业务逻辑。
- preload 只负责输入输出转换与最小暴露。

### 第三阶段：补齐工程质量

- 引入契约测试（API <-> IPC 协议一致性）。
- 引入主流程集成测试（最小可运行 demo）。
- 建立性能基线（冷启动、首个 IPC 调用、批量调用吞吐）。

## 重构后最小目录建议

```text
packages/capacitor-electron/
  src/
    api/
    bridge/
    host/
    shared/
    index.ts
  tests/
    unit/
    integration/
```

## 验收判定（从“可用模板”到“可实现平台”）

满足以下条件即可进入正式编码阶段：

- API 合同文档已冻结（版本化）。
- IPC 协议文档已冻结（请求、响应、错误模型）。
- 架构文档中职责边界已明确，且无循环依赖。
