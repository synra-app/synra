# 插件与 SDK 专项文档

本目录用于单独沉淀“第一个插件（chat）”与 `plugin-sdk` 改造方案，不再混在前端页面文档中。

## 目标

- 明确 `@synra-plugin/chat` 的产品与技术边界。
- 明确 `plugin-sdk` 如何支持插件页面生命周期（进入插件/退出插件）。
- 明确插件页面加载机制（使用插件 `dist` 构建产物，不新增 manifest.json）。
- 明确移动端安装与激活插件的逻辑。

## 文档清单

1. `first-plugin-chat.md`
   - 第一个插件（chat）的范围、页面、路由、默认内置策略。
2. `sdk-lifecycle-and-routing.md`
   - `plugin-sdk` 生命周期接口改造方案（`onPluginEnter` / `onPluginExit`）。
3. `plugin-page-loading-and-mobile-install.md`
   - 插件页面加载链路与移动端安装流程（同步、校验、缓存、激活）。

## 关键约束

- 插件元信息只来自 `package.json`，不新增 `manifest.json`。
- `pluginId` 从 `package.json.name` 解析，允许两种包名模式：
  - `@synra-plugin/<plugin-id>`
  - `synra-plugin-<plugin-id>`
- `pluginId` 只取后缀 `<plugin-id>`，不包含前缀；格式限制为 `a-z`、`0-9`、`-`。
- 插件扩展元信息放在 `package.json.synra`。
