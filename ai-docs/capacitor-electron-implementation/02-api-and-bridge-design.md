# 02 API 与桥接协议设计

## 目标

定义 `@synra/capacitor-electron` 的稳定公共契约，使其同时满足：

- 对业务侧：接近标准 Capacitor 插件调用体验。
- 对实现侧：IPC 协议清晰、可校验、可版本化。
- 对开源侧：可兼容演进、可测试、可审计。

## API 设计原则

- 类型优先：所有公开 API 都有显式输入/输出类型。
- Capacitor 语义优先：Promise 返回、错误可预测、方法命名语义化。
- 协议先行：先定义请求/响应与错误码，再实现 handler。
- 版本可协商：请求携带协议版本，主进程返回支持范围。
- 默认可观测：每个请求具备 requestId 和耗时记录。

## 与 Capacitor 插件对齐规则

- 通过 `registerPlugin` 暴露插件入口，业务只调用 typed methods。
- API 返回 `Promise<T>`，不返回裸 `BridgeResponse`。
- 插件方法内部可抛业务友好错误，但底层错误码应保持稳定。
- 未支持能力统一返回 `UNSUPPORTED_OPERATION`，并附带可支持能力信息。

## 对外 API 形态（示例）

```ts
export interface ElectronBridgePlugin {
  getRuntimeInfo(): Promise<RuntimeInfo>;
  openExternal(options: OpenExternalOptions): Promise<OperationResult>;
  readFile(options: ReadFileOptions): Promise<ReadFileResult>;
}
```

说明：

- `getRuntimeInfo`：返回平台、版本、能力标识、协议版本。
- `openExternal`：演示受控系统能力调用。
- `readFile`：演示权限、路径策略和返回格式约束。

## 方法命名与能力分组

- 方法命名建议使用 `domain.action` 格式（如 `runtime.getInfo`、`file.read`）。
- 方法注册采用白名单 map，不支持动态 method 透传。
- 建议按能力域维护文档段落：runtime、external、file、window。

## 请求结构

```ts
type BridgeRequest<TPayload = unknown> = {
  protocolVersion: "1.0";
  requestId: string;
  method: string;
  payload: TPayload;
  meta?: {
    timeoutMs?: number;
    source?: "capacitor-webview";
    traceId?: string;
  };
};
```

字段约束：

- `protocolVersion`：必填，当前固定 `1.0`。
- `requestId`：必填，单请求唯一，用于日志与排障。
- `method`：必填，必须命中主进程白名单。
- `payload`：必填，允许空对象，不允许 `undefined`。

## 响应结构

```ts
type BridgeResponse<TData = unknown> =
  | { ok: true; requestId: string; data: TData }
  | {
      ok: false;
      requestId: string;
      error: {
        code: BridgeErrorCode;
        message: string;
        details?: unknown;
      };
    };
```

响应约束：

- `ok: true` 时必须包含 `data`，不得包含 `error`。
- `ok: false` 时必须包含 `error`，不得包含 `data`。
- `requestId` 必须与请求一致。

## 错误码规范

- `INVALID_PARAMS`：参数校验失败。
- `UNAUTHORIZED`：权限不足或安全策略拒绝。
- `NOT_FOUND`：目标资源不存在。
- `TIMEOUT`：超时。
- `UNSUPPORTED_OPERATION`：当前平台不支持。
- `INTERNAL_ERROR`：未知错误兜底。

错误返回建议附加：

- `details.retryable`：是否建议调用方重试。
- `details.supportedVersions`：协议不兼容时返回可支持版本。
- `details.capabilityKey`：能力未启用时返回能力标识。

## Channel 命名规范

固定前缀并显式版本：

- `synra:cap-electron:v1:invoke`
- `synra:cap-electron:v1:event`（可选，用于事件推送）

规则：

- 不允许动态拼接任意 channel。
- 主进程只注册白名单 channel。
- 不同主版本使用不同 channel 前缀，避免跨版本歧义。

## Preload 侧设计

职责：

- 把渲染层调用转换为统一 `BridgeRequest`。
- 在发送前做 schema 校验（输入防御）。
- 在接收后做 `BridgeResponse` 解析（输出防御）。

推荐仅暴露单一入口：

```ts
window.__synraCapElectron.invoke(method, payload, options?)
```

再由 JS API 层封装为业务友好的函数，避免业务直接拼接 `method` 字符串。

## Main 侧 Handler 设计

建议设计为“注册中心 + handler map”：

- `registerBridgeHandlers(ipcMain, deps)`：统一注册。
- `handlerMap[method]`：按 method 分发。
- 每个 handler 只做输入校验、策略检查与 service 调用。
- 未命中的 method 返回 `UNSUPPORTED_OPERATION`。

## 超时与取消

- JS API 默认超时（例如 10s），支持调用方覆盖。
- Main 侧若遇长任务，应使用可中断机制（AbortSignal 或任务 token）。
- 超时返回 `TIMEOUT`，并清理挂起任务状态。

## 版本兼容策略

- 请求携带 `protocolVersion`。
- Main 侧维护可支持版本集合。
- 版本不匹配时返回 `UNSUPPORTED_OPERATION` 并附 `details.supportedVersions`。
- 保持至少一个次级版本的兼容窗口（例如 `1.0` 与 `1.1` 并行）。

## 兼容矩阵字段约定

建议在 `getRuntimeInfo` 中返回：

```ts
type RuntimeInfo = {
  protocolVersion: string;
  supportedProtocolVersions: string[];
  capacitorVersion: string;
  electronVersion: string;
  nodeVersion: string;
  platform: "win32" | "darwin" | "linux";
  capabilities: string[];
};
```

## 安全要点

- preload 只暴露必要 API，不暴露完整 Electron 对象。
- 对路径、URL、命令参数做强校验与白名单限制。
- 禁止将底层错误堆栈透传给渲染层。
- 请求体大小应设置上限，大 payload 走文件或流式路径。

## 测试关注点

- 协议契约测试：请求/响应 schema 与类型一致。
- 错误映射测试：异常场景返回稳定错误码。
- 兼容性测试：不同协议版本请求行为可预测。
- 超时与取消测试：长任务可中止且状态可清理。
- 白名单测试：非法 method/channel 无法执行。

## 范围说明

本文件仅覆盖 `@synra/capacitor-electron` 内部的 JS API 与 Electron IPC 桥接。  
跨端通讯、插件回执、幂等与重试、`@synra/*` 传输抽象已迁移至 `ai-docs/main` 目录。
