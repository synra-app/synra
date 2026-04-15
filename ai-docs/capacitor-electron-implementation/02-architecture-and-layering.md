# 02 架构与分层设计

## 目标

在 `packages/capacitor-electron` 内形成“可演进、可替换、可测试”的分层架构，避免 Capacitor API、Electron 进程通信、业务能力实现三者耦合。

## 分层总览

```mermaid
flowchart LR
  capacitorJs[CapacitorJsApiLayer] -->|typedInvoke| preloadLayer[PreloadBridgeLayer]
  preloadLayer -->|ipcInvoke| mainLayer[MainHandlerLayer]
  mainLayer --> serviceLayer[ServiceLayer]
  serviceLayer --> adapterLayer[AdapterLayer]
```

## 分层职责

### 1) Capacitor JS API 层（`src/api`）

- 对外暴露 Capacitor 插件 API。
- 负责参数类型约束与返回值包装。
- 不直接接触 `ipcRenderer` 与 Electron Node API。

### 2) Preload Bridge 层（`src/bridge/preload`）

- 通过 `contextBridge.exposeInMainWorld` 暴露最小能力。
- 执行参数序列化、schema 校验与调用跟踪。
- 仅通过白名单 channel 与主进程通信。

### 3) Main Handler 层（`src/bridge/main`）

- 注册并管理 `ipcMain.handle`。
- 将请求分发到服务层。
- 统一处理错误映射、超时、取消与日志。

### 4) Service 层（`src/host/services`）

- 承载可测试的业务能力（窗口管理、文件系统、系统能力等）。
- 不依赖 Electron IPC 细节，便于独立单测。

### 5) Adapter 层（`src/host/adapters`）

- 对 Electron API 与 Node API 做适配包装。
- 吸收 Electron 版本升级产生的接口差异。

## 依赖方向约束

- 只允许上层依赖下层，不允许反向依赖。
- `api` 不能直接依赖 `host/services`。
- `service` 不应依赖 `bridge`，仅依赖 `shared` 与 `adapters`。

## 共享模块（`src/shared`）

用于跨层复用的纯模型：

- 请求/响应类型定义
- 错误码与错误结构
- channel 常量与协议版本
- schema（如 zod）与序列化工具

## 生命周期设计

### 初始化阶段

1. 主进程创建窗口并初始化安全参数（`contextIsolation: true`）。
2. 主进程注册所有 handler（一次性注册，避免热更新重复注册）。
3. preload 暴露桥接 API。
4. JS API 层探测协议版本与可用能力。

### 运行阶段

- 所有调用通过统一 `invoke` 管道。
- 每个调用附带 `requestId` 与时间戳，支持链路追踪。

### 退出阶段

- 主进程关闭时释放资源（监听器、定时器、文件句柄）。
- 中断中的异步任务需可取消或可超时回收。

## 错误模型

统一返回结构：

```text
{ ok: true, data }
{ ok: false, error: { code, message, details? } }
```

规则：

- 主进程捕获未知异常并映射为 `INTERNAL_ERROR`。
- 业务可预期错误使用稳定错误码（如 `INVALID_PARAMS`、`UNSUPPORTED_OPERATION`）。
- preload 与 JS 层不抛出原始错误堆栈给业务页面。

## 安全边界

- 强制启用 `contextIsolation`。
- 默认禁用 NodeIntegration，避免渲染进程直接触达 Node。
- channel 命名采用前缀白名单（如 `synra:cap-electron:*`）。
- 所有跨进程 payload 必须通过 schema 校验。

## 代码组织建议

```text
src/
  api/
    plugin.ts
    client.ts
  bridge/
    preload/
      expose.ts
      invoke.ts
    main/
      register.ts
      handlers/
  host/
    services/
    adapters/
  shared/
    protocol/
    errors/
    schema/
  index.ts
```
