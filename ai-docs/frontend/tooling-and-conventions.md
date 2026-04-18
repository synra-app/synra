# 工具链与编码约定

本文档定义产品化前端的工程约束，重点覆盖自动导入、插件列表页面规范与 UnoCSS 协作规则。

## 自动导入目标

- 页面与组件内默认不手写常见 API 的 `import`。
- 降低样板代码，提高重构效率和文件可读性。
- 保持类型系统和 lint 行为一致，避免“运行可用但类型报错”。

## 自动导入方案

使用 `unplugin-auto-import`，覆盖以下来源：

- `vue`
  - `ref`、`reactive`、`computed`、`watch`、`watchEffect`
  - `onMounted`、`onUnmounted`、`nextTick`
- `vue-router`
  - `useRoute`、`useRouter`
  - `onBeforeRouteLeave`、`onBeforeRouteUpdate`
- `pinia`（可选但推荐）
  - `storeToRefs`
- 本地目录
  - `src/composables/**` 下导出的 `useXxx`

## 目录与命名规范

- 组合式函数统一放在 `src/composables`。
- 文件命名：`use-xxx.ts` 或 `useXxx.ts`（团队二选一并保持一致）。
- 导出命名：必须是 `useXxx` 形式，语义明确。
- 一类职责一个 composable，不把多个无关领域塞入同一文件。

## 页面路由命名规范

- 应用内置页面统一使用 `pages/_xxx/index.vue` 文件命名，避免与插件动态页面命名冲突。
- 推荐映射：
  - `pages/_home/index.vue` -> `/home`
  - `pages/_plugins/index.vue` -> `/plugins`
  - `pages/_devices/index.vue` -> `/devices`
  - `pages/_settings/index.vue` -> `/settings`
- 插件页面不进入应用内置 `pages/_xxx/index.vue` 命名空间，由插件生命周期在运行时注册路由。

## 示例配置（说明性）

```ts
// vite.config.ts (示例片段)
import AutoImport from "unplugin-auto-import/vite";

AutoImport({
  imports: ["vue", "vue-router", "pinia"],
  dirs: ["src/composables"],
  dts: ".auto-generated/auto-imports.d.ts",
  vueTemplate: true,
});
```

说明：具体路径与选项以前端项目最终配置为准，本文件仅定义方向与边界。

## 插件列表页约定

### 页面目标

- `Plugins` 页面是插件入口页，首版可先不接完整安装/卸载逻辑。
- 至少具备：
  - 搜索输入 UI
  - 插件卡片网格
  - 插件状态文案

### 数据与展示规则

- 默认数据源可先使用静态模拟数据（后续替换真实 catalog）。
- 内置插件 `chat` 默认展示为已安装。
- 卡片字段统一：
  - `name`
  - `version`
  - `status`
  - `icon`

### 图标规则

- 优先使用插件 `dist/logo.png`。
- 缺失时统一回退到 UnoCSS icon（例如插件默认图标）。
- 不允许出现空白图标区域。

## 类型与检查

- 自动导入声明文件应纳入 TypeScript 检查上下文。
- lint 规则需识别自动导入全局，避免误报未定义。
- CI 或本地检查至少覆盖：
  - 类型检查通过
  - lint 通过
  - 页面构建通过

## 显式 `import` 例外规则

以下场景允许显式导入：

- 命名冲突，自动导入可读性下降。
- 只在单个文件短期使用且不希望进入全局自动导入范围。
- 第三方库非常规 API，必须显式展示来源。

## UnoCSS 协作约定

- 自动导入解决逻辑层样板，UnoCSS 解决样式层样板，两者配合使用。
- 组件开发时先确定断点行为，再写类名。
- 超过 3 处重复的类组合，应沉淀为组件结构或 UnoCSS 快捷模式。

## UnoCSS 语义色规范

推荐主题色槽位：

- `primary`
- `success`
- `warning`
- `error`
- `info`
- `surface`
- `muted`

语义映射规则：

- `success`：连接成功、安装成功、可用状态
- `error`：失败、阻断、不可用状态
- `warning`：待确认、风险提醒
- `info`：中性提示
- `surface/muted`：背景层级与辅助文案

要求：

- 页面状态颜色优先使用语义色，不使用随意临时颜色。
- 同一语义在全站颜色保持一致，避免“同含义不同色”。

## 自动导入验收清单

- `vue` 常用 API 在 `script setup` 中可直接使用。
- `vue-router` API 在页面中可直接使用。
- `src/composables` 导出函数在页面/组件中可直接使用。
- 类型检查与 lint 对自动导入无误报。
- 代码评审不再要求手动补齐这些来源的 import。

## 插件列表页验收清单

- 搜索输入区可见并符合布局规范。
- 插件卡片在各断点列数自适应且无溢出。
- `chat` 插件默认展示在列表中。
- 图标回退逻辑在无 `logo.png` 场景可正常显示。
