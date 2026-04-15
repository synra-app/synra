# Synra Capacitor Electron 实现文档

整理日期：2026-04-15

本文档集用于从零实现 `@synra/capacitor-electron`，目标是构建一个面向开源长期维护的 Capacitor + Electron 插件宿主层。

## 目标与定位

- 面向 `packages/capacitor-electron` 建立可演进、可测试、可发布的实现方案。
- 与 Capacitor 插件调用语义对齐（Promise API、稳定错误模型、版本可协商）。
- 采用安全默认配置（最小暴露桥接、IPC 白名单、输入校验）。
- 以开源可维护为前提定义兼容矩阵、测试矩阵、版本策略和发布策略。

## 从零实现阅读顺序

以下顺序直接从架构设计开始：

1. `01-architecture-and-layering.md`：确认分层、进程边界、信任边界与生命周期。
2. `02-api-and-bridge-design.md`：固化 API/IPC 协议、错误码与版本兼容策略。
3. `03-modern-stack-and-performance.md`：明确兼容矩阵、工程约束、性能与可观测性策略。
4. `04-implementation-roadmap.md`：按开源交付节奏执行里程碑（MVP -> Beta -> 1.0）。
5. `checklist.md`：实现与验收的执行清单。

## 术语

- `Renderer`：Capacitor WebView 渲染进程。
- `Preload`：渲染进程和主进程之间的受限桥接层。
- `Main`：Electron 主进程，负责能力调度与安全边界控制。
- `Service`：宿主能力实现层（文件系统、窗口、系统交互等）。
- `Adapter`：Electron/Node API 适配层，用于隔离底层版本变化。
- `Protocol`：跨进程请求/响应模型、错误模型、版本字段与 channel 规范。

## 范围与非范围

范围内：

- `@synra/capacitor-electron` 内部架构、API/协议、测试、发布与开源交付要求。
- Electron 宿主桥接能力的设计与落地标准。

范围外：

- 跨端传输、插件运行时编排等 `ai-docs/main` 中已定义主题。

## 开源对齐基线

- 参考社区项目：[capacitor-community/electron](https://github.com/capacitor-community/electron)。
- 策略为“理念对齐 + 现代化重建”，不直接复制旧实现细节。
- 需要在文档中持续保持四项显式约束：兼容矩阵、安全基线、测试矩阵、版本策略。

## 执行原则

- 接口先行：先冻结协议与错误模型，再实现具体能力。
- 安全默认：默认拒绝、显式授权，不在 preload 暴露多余对象。
- 分层单向依赖：上层依赖下层，禁止跨层反向引用。
- 可观测优先：关键调用必须具备 requestId、耗时、结果状态。
- 变更可发布：每个里程碑均可验证、可回滚、可说明迁移影响。
