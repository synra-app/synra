# 组件架构（产品版）

本文档定义产品页面组件优先级，目标是支撑左侧菜单应用壳层与插件列表体验。

## 组件分层

- `Shell Layer`：应用骨架与导航组件。
- `Page Layer`：页面级布局组件。
- `Domain Layer`：业务卡片与列表组件。
- `UI Primitive`：按钮、输入框、图标、标签等基础组件。

## 首批组件清单

### `SidebarNav`

- 职责：左侧菜单容器，支持收缩/展开。
- 关键能力：
  - 菜单项渲染
  - 收缩状态管理
  - CSS 动画触发

### `SidebarItem`

- 职责：单个菜单项（图标 + 名称）。
- 输入：
  - `icon`
  - `label`
  - `to`
  - `active`
  - `collapsed`

### `AppShellLayout`

- 职责：统一 `Sidebar + ContentArea` 页面骨架。
- 插槽：
  - `sidebar`
  - `default`（内容区）

### `PluginSearchBar`

- 职责：插件列表页搜索输入区（首版可仅 UI）。
- 输入：
  - `keyword`
  - `placeholder`
- 输出：
  - `update:keyword`
  - `search`

### `PluginCardGrid`

- 职责：插件卡片响应式网格容器。
- 布局目标：
  - `base/sm`: 1 列
  - `md`: 2 列
  - `lg`: 3 列
  - `xl+`: 4 列

### `PluginCard`

- 职责：展示插件核心信息。
- 输入：
  - `name`
  - `version`
  - `status`
  - `logoUrl?`
  - `fallbackIcon`
- 图标规则：
  - 优先使用 `dist/logo.png`
  - 无图时使用 UnoCSS icon 作为回退

### `DevicePanel`

- 职责：承载设备页主流程（发现、配对、连接）区块。
- 说明：保留现有能力，但改成产品文案和信息层级。

### `SettingsPanel`

- 职责：承载设置页卡片化分组（诊断、关于）。

## 页面与组件映射

- `Home`：`AppShellLayout` + `PanelCard`（品牌与版本）
- `Plugins`：`PluginSearchBar` + `PluginCardGrid` + `PluginCard`
- `Devices`：`DevicePanel`（可内部复用 discovery/session 组件）
- `Settings`：`SettingsPanel`（复用 `PanelCard`）

## 动画与交互要求

- 侧栏收缩动画由 `SidebarNav` 统一管理，页面不重复实现。
- 插件卡片 hover/press 状态采用统一交互样式，避免各卡片自行定义。
- 搜索框输入与过滤结果区域保留稳定高度，避免跳动。

## 封装原则

- 页面负责信息组合，组件负责视觉和交互细节。
- 路由切换与菜单激活逻辑集中在 shell 层，不分散在页面内。
- 图标回退规则在 `PluginCard` 内统一处理，不在页面模板重复判断。
