# Frontend UI Rules

适用于 `apps/frontend` 的页面、组件与样式实现规范。

## 适配策略

- 同一套前端覆盖桌面端、移动端和 Web，禁止为单端写独立流程分支。
- 采用移动优先布局：先保证 `base/xs/sm` 可用，再增强 `md/lg/xl` 信息密度。
- 大屏适配只改变排布，不改变主流程顺序与关键动作位置。

## UnoCSS 断点与常见模式

- 使用 `uno.config.ts` 中断点：`xs/sm/md/lg/xl/2xl/3xl`。
- 常见容器模式：
  - 页面容器：`mx-auto w-full max-w-* px-*`
  - 双栏：`grid grid-cols-1 md:grid-cols-12`
  - 三栏：`lg:grid lg:grid-cols-12`
- 常见栅格模式：
  - `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- 禁忌：
  - 在页面中堆叠大量临时类导致语义不清
  - 断点跳级覆盖且无说明
  - 不同页面同一交互采用不同断点策略

## 自动导入与 composables

- 前端默认使用自动导入，减少手写 `import`。
- 自动导入范围至少包含：
  - `vue`
  - `vue-router`
  - `src/composables` 下 `useXxx`
- composable 规范：
  - 目录：`src/composables`
  - 命名：`useXxx`
  - 职责单一，按领域拆分（会话、发现、日志、执行态）

## 组件封装约定

- 页面负责流程编排，组件负责状态展示与事件发射。
- 领域组件不直接耦合路由与 store，实现通过 props/emits 交互。
- 同类展示块（卡片、会话列表、日志列表）优先复用组件，不重复粘贴模板。

## 验收要求

- 小屏可完整执行主流程，关键操作无需横向滚动。
- 中屏与大屏布局提升信息效率，但不增加认知路径。
- 自动导入场景通过类型检查与 lint，无未定义误报。
- 新页面遵循统一术语和状态文案。
