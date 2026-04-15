# 03 API 与桥接协议设计

## 目标

建立稳定的 Capacitor JS API 与 Electron IPC 协议，使业务调用体验接近普通 Capacitor 插件，同时保留 Electron 端能力扩展空间。

## API 设计原则

- 类型优先：所有公开 API 必须有显式输入/输出类型。
- 最小惊讶：调用语义与 Capacitor 插件保持一致（Promise 风格）。
- 可演进：通过版本字段和能力探测兼容未来扩展。
- 可观测：每次请求可追踪 requestId 与耗时。

## 对外 API 形态（建议）

```ts
export interface ElectronBridgePlugin {
  getRuntimeInfo(): Promise<RuntimeInfo>;
  openExternal(options: OpenExternalOptions): Promise<OperationResult>;
  readFile(options: ReadFileOptions): Promise<ReadFileResult>;
}
```

说明：

- `getRuntimeInfo`：用于能力探测与调试信息上报。
- `openExternal`：最小可用系统能力示例。
- `readFile`：验证权限、路径校验与二进制传输策略。

## 协议模型

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
  };
};
```

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

## 错误码建议

- `INVALID_PARAMS`：参数校验失败。
- `UNAUTHORIZED`：权限不足或策略拒绝。
- `NOT_FOUND`：目标资源不存在。
- `TIMEOUT`：超时。
- `UNSUPPORTED_OPERATION`：当前平台不支持。
- `INTERNAL_ERROR`：未知错误兜底。

## Channel 命名规范

固定前缀并显式版本：

- `synra:cap-electron:v1:invoke`
- `synra:cap-electron:v1:event`（可选，用于事件推送）

规则：

- 不允许动态拼接任意 channel。
- 主进程只注册白名单 channel。

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
- 每个 handler 只做输入校验与 service 调用，不做复杂流程控制。

## 超时与取消

- JS API 默认超时（例如 10s），支持调用方覆盖。
- Main 侧若遇长任务，应使用可中断机制（AbortSignal 或任务 token）。
- 超时返回 `TIMEOUT`，并清理挂起任务状态。

## 版本兼容策略

- 请求携带 `protocolVersion`。
- Main 侧维护可支持版本集合。
- 版本不匹配时返回 `UNSUPPORTED_OPERATION` + `details.supportedVersions`。

## 安全要点

- preload 只暴露必要 API，不暴露完整 Electron 对象。
- 对路径、URL、命令参数做强校验与白名单限制。
- 禁止将底层错误堆栈透传给渲染层。

## 测试关注点

- 协议契约测试：请求/响应 schema 与类型一致。
- 错误映射测试：异常场景返回稳定错误码。
- 兼容性测试：不同协议版本请求行为可预测。

## 范围说明

本文件仅覆盖 `@synra/capacitor-electron` 内部的 JS API 与 Electron IPC 桥接。  
跨端通讯、插件回执、幂等与重试、`@synra/*` 传输抽象已迁移至 `ai-docs/main` 目录。
