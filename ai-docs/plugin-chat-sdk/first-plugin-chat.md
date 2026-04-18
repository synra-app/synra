# 第一个插件：Chat

## 插件定位

- 插件包名：`@synra-plugin/chat`
- 类型：内置插件（built-in）
- 默认状态：已安装、可见（在插件列表页默认展示）

## 页面与入口

- 插件业务页面由插件自身实现，不写在应用 `pages` 目录中。
- 页面最终来自插件 `dist` 构建产物（JS 模块，导出可挂载 Vue 组件）。
- 插件列表点击该插件后进入插件页面。

## 路由规则

- 插件页面路由格式：`/plugin-${pluginId}/${pageKey}`
- Chat 例子：`/plugin-chat/home`

## 路由注册策略（懒注册）

1. 用户进入插件列表页，只显示卡片，不提前注册插件路由。
2. 用户点击 chat 卡片：
   - 执行插件进入生命周期（`onPluginEnter`）
   - 动态注册插件页面路由
   - 跳转到插件 home 页面（`/plugin-chat/home`）
3. 用户从插件页面返回插件列表：
   - 执行插件退出生命周期（`onPluginExit`）
   - 注销该插件路由

## 插件列表展示规范（与前端文档对齐）

- 卡片字段：图标、名称、版本、状态。
- 图标规则：
  - 优先 `dist/logo.png`
  - 缺失时回退 UnoCSS icon
- 搜索：首版可先做 UI（本地过滤可后接）。

## package.json 约定

- `name`：用于解析 `pluginId`（只取后缀，不含前缀）。
- `version`：作为插件版本来源。
- `synra`：插件扩展信息来源（如标题、描述、默认页面键、图标声明等）。

示例（说明性）：

```json
{
  "name": "@synra-plugin/chat",
  "version": "0.1.0",
  "synra": {
    "title": "Chat",
    "defaultPage": "chat",
    "builtin": true
  }
}
```
