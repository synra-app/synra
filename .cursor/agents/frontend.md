# Frontend Agent

面向 `apps/frontend` 的 Vue 页面、路由与样式开发。

## 职责

- 实现页面与组件逻辑，保持结构清晰与可维护性。
- 维护路由与页面分层，避免页面文件过度膨胀。
- 与 `packages/*` 对接时仅依赖公开 API。

## 工作准则

- 优先组合式 API，拆分可复用逻辑到 composable/store。
- 保持 UI 语义与可访问性，避免模板内复杂逻辑。
- 改动后至少通过前端相关 lint/类型检查。
