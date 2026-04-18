# 前端产品文档

本目录用于沉淀 Synra 前端产品化页面规范。当前目标是明确四个一级页面的体验标准：主页、插件、设备、设置。

## 阅读顺序

1. `information-architecture.md`：先看产品页面结构与流转。
2. `layout-and-navigation.md`：看侧边栏、动画、响应式和颜色语义。
3. `component-architecture.md`：看组件清单与封装边界。
4. `tooling-and-conventions.md`：看插件列表页与工具链约束。
5. `implementation-phases.md`：看实施阶段与验收标准。
6. `state-and-events.md`：看状态层参考（设备/会话能力）。

## 当前产品范围

- 应用壳层：左侧菜单 + 内容区。
- 一级菜单：`Home`、`Plugins`、`Devices`、`Settings`。
- 页面目标：
  - `Home`：品牌与版本极简展示。
  - `Plugins`：插件列表卡片 + 搜索 + 图标回退规则。
  - `Devices`：连接配对能力页（产品化文案）。
  - `Settings`：诊断与关于。
- 页面文件命名约定：内置页面统一采用 `pages/_xxx/index.vue`（如 `pages/_home/index.vue`、`pages/_plugins/index.vue`），减少与插件动态路由冲突。

## 核心术语

- `Sidebar`：左侧菜单导航区域，可收缩。
- `PluginCard`：插件列表卡片单元，包含图标、名称、版本、状态。
- `Built-in Plugin`：内置插件（如 `chat`），默认在列表中展示为已安装。
- `Semantic Color`：语义色（`success/error/warning` 等），用于统一状态表达。

## 文档边界

- 本目录只定义产品页面和前端规范，不直接定义协议字段。
- 协议与运行时能力仍以 `ai-docs/main` 与 `packages/*` 为准。
- 第一个插件与 SDK 生命周期改造文档已拆分到 `ai-docs/plugin-chat-sdk`。
- 本次文档重构不讨论 demo 兼容，仅以产品目标为导向。
