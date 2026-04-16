# 插件运行时设计（MVP）

## 目标

在不修改 `app.md` 愿景的前提下，把插件执行链路收敛为可实现的 MVP 规则：  
`输入分享 -> 插件匹配 -> 用户选择动作 -> PC 执行 -> 三阶段回执回传`。

## 设计约束

- 不内置业务动作，动作语义由插件定义。
- 不做“记住默认动作”，每次都由用户选择。
- 不做插件显式权限声明，由运行时统一管控。
- 插件执行必须隔离，单插件卡住不得影响主进程。

## 角色划分

- `@synra/plugin-sdk`
  - 定义插件接口、动作模型、执行回执模型。
- `@synra/plugin-runtime`
  - 插件注册、匹配编排、用户选择编排、超时控制、回执聚合。
- `@synra/capacitor-electron`
  - PC 侧受控执行适配器（打开浏览器、打开文件等）。

## PC 作为插件服务端

在新架构下，PC 不仅负责执行动作，还承担插件服务端职责：

- PC 维护本机已安装插件与规则配置（作为 source of truth）。
- 其他设备连接后，通过跨端协议向 PC 拉取插件清单与规则。
- 设备侧不直接信任本地缓存，连接 PC 后以 PC 返回内容为准做同步。

```mermaid
flowchart LR
  mobileClient[MobileOrOtherDevice] --> pluginApi[PluginCatalogApiOnPc]
  pluginApi --> runtimeStore[PluginRegistryAndRuleStore]
  runtimeStore --> isolatedExec[IsolatedPluginWorkers]
```

## 插件契约（MVP）

```ts
export interface SynraPlugin {
  id: string;
  version: string;
  supports(input: ShareInput): Promise<PluginMatchResult>;
  buildActions(input: ShareInput): Promise<PluginAction[]>;
  execute(action: PluginAction, context: ExecuteContext): Promise<PluginExecutionResult>;
}

export interface PluginAction {
  actionId: string;
  actionType: string;
  payload: unknown; // Opaque payload, validated by plugin/runtime bridge
}
```

## `@synra/plugin-sdk` 类型草案（MVP）

```ts
export interface ShareInput {
  kind: "text" | "link" | "file";
  raw: unknown;
  sourceApp?: string;
}

export interface PluginMatchResult {
  matched: boolean;
  score?: number;
  reason?: string;
}

export interface ExecuteContext {
  messageId: string;
  sessionId: string;
  timestamp: number;
  timeoutMs: number;
  role: "sender" | "receiver";
}

export interface PluginExecutionResult {
  ok: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
}
```

## 运行时流程

```mermaid
flowchart LR
  roleSelect[RoleSelect_sender_receiver] --> inputData[ShareInput]
  inputData --> pluginRuntime[PluginRuntime]
  pluginRuntime --> supportsPhase[SupportsPhase]
  supportsPhase --> actionBuildPhase[BuildActionsPhase]
  actionBuildPhase --> userSelectPhase[UserSelectPhase]
  userSelectPhase --> isolatedExec[IsolatedWorkerExecute]
  isolatedExec --> receiptStages[RECEIVED_STARTED_FINISHED]
```

## 冲突与选择策略

- 多插件命中时，统一聚合候选动作。
- 首版固定策略：每次用户选择，不自动落默认。
- 用户取消选择时，返回可解释取消结果，不触发执行。

## 执行与回执模型

### 三阶段回执映射

- `runtime.received`：运行时已接收并准备执行。
- `runtime.started`：动作已进入插件隔离执行器。
- `runtime.finished`：执行结束，必须带 `status=success|failed|cancelled`。

### 失败与取消表达

- 执行失败：`runtime.finished` + `status=failed` + `{ code, message }`。
- 用户取消：`runtime.finished` + `status=cancelled`（不走错误码）。
- 协议级即时错误：`runtime.error` + `{ code, message }`。

### 超时规则

- 由运行时统一设置执行超时。
- 超时直接生成 `EXECUTION_TIMEOUT` 并返回 `FINISHED` 失败结果。

## 隔离模型

- 调度层统一在 `@synra/plugin-runtime`。
- 每个插件动作在独立 Worker/子进程执行。
- 调度层负责健康探测、超时中断、结果回传。

## `@synra/plugin-runtime` 对接接口草案（MVP）

```ts
import type { SynraRuntimeMessage } from "@synra/protocol";

export interface PluginRuntime {
  register(plugin: SynraPlugin): void;
  unregister(pluginId: string): void;
  listPlugins(): string[];

  resolveActions(input: ShareInput): Promise<PluginActionCandidate[]>;
  executeSelected(
    candidate: PluginActionCandidate,
    context: ExecuteContext,
  ): Promise<PluginExecutionResult>;
}

export interface PluginActionCandidate {
  pluginId: string;
  action: PluginAction;
  matchScore: number;
  explain?: string;
}

export interface RuntimeMessageBridge {
  emit(message: SynraRuntimeMessage): Promise<void>;
}

export interface PluginCatalogService {
  listInstalled(): Promise<InstalledPluginInfo[]>;
  fetchBundle(pluginId: string, version: string): Promise<PluginBundleRef>;
  getRules(pluginId: string): Promise<PluginRuleConfig>;
}

export interface InstalledPluginInfo {
  pluginId: string;
  version: string;
  displayName: string;
  sdkRange: string;
  checksum?: string;
}

export interface PluginBundleRef {
  pluginId: string;
  version: string;
  downloadUrl?: string;
  inlineBundleBase64?: string;
  checksum?: string;
}

export interface PluginRuleConfig {
  pluginId: string;
  enabled: boolean;
  ruleVersion: number;
  rules: Record<string, unknown>;
}
```

### 协议对接约束

- 接收到 `runtime.request` 后，运行时必须先发送 `runtime.received`。
- 动作进入隔离执行器后，必须发送 `runtime.started`。
- 结束时必须发送 `runtime.finished`，且带 `status`。
- 无法进入执行闭环的异常，发送 `runtime.error`。
- 设备请求插件清单/规则时，PC 必须返回当前已安装版本与规则版本。
- 设备请求插件包时，PC 返回可校验的包引用（`checksum`）。

### 插件同步约束

- 连接建立后，设备先拉取插件清单，再按需拉取缺失插件包与规则。
- 插件规则以 PC 为准，设备可本地缓存但不可擅自改写主版本。
- 若插件版本不兼容，设备保留元信息但标记为不可执行。
- 进入插件后先选择当前角色（`sender` 或 `receiver`），再加载对应页面与动作流程。

## 错误语义（与传输层对齐）

- 传输前失败：`DEVICE_OFFLINE` / `NOT_PAIRED` / `SESSION_EXPIRED`。
- 执行失败：`EXECUTION_TIMEOUT` / `PLUGIN_REJECTED` / `ADAPTER_ERROR`。
- 运行时状态异常：`RUNTIME_INVALID_STATE` / `RUNTIME_BUSY`。
- 所有错误都要求可直接映射到手机端可读提示。

## 安全与边界

- 插件不可直接访问 Electron 原生对象。
- 系统能力必须经 `action adapter` 白名单。
- Opaque payload 在进入 adapter 前必须经过运行时校验与净化。

## 示例：Github 打开插件

- 输入：`imba97/smserialport` 或 `https://github.com/imba97/smserialport`
- 处理：插件识别并标准化 URL，产出候选动作
- 交互：用户确认后触发执行
- 结果：PC 打开浏览器并回传 `FINISHED`
