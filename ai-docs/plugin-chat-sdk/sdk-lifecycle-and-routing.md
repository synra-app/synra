# SDK 生命周期与路由注册改造

## 改造目标

将原先单一页面注册思路升级为插件生命周期接口，确保插件路由按需注册与清理。

## 接口提议

在 `plugin-sdk` 中为 UI 插件增加生命周期方法：

- `onPluginEnter(registry)`：进入插件时调用
- `onPluginExit(registry)`：退出插件时调用

`registry` 最小能力：

- `register(pageKey, loader)`：注册页面加载器
- `unregister(pageKey)`：注销页面

其中 `loader` 返回动态导入模块，模块默认导出 Vue 组件（`defineComponent`）。

## 示例（说明性）

```ts
onPluginEnter(registry) {
  registry.register("chat", () => import("./pages/chat.vue"));
}

onPluginExit(registry) {
  registry.unregister("chat");
}
```

## 路由自动映射

应用宿主负责将插件页面映射为应用路由：

- 输入：`pluginId + pageKey`
- 输出：`/plugin-${pluginId}/${pageKey}`

示例：

- `pluginId = chat`
- `pageKey = home`
- 路径：`/plugin-chat/home`

## 状态机建议

- `idle`：插件未激活，路由未注册
- `entering`：执行 `onPluginEnter`
- `active`：路由已注册并可访问
- `exiting`：执行 `onPluginExit`
- `idle`：路由已注销

## 错误处理

- `onPluginEnter` 失败：不注册路由，停留在插件列表，显示错误提示。
- `onPluginExit` 失败：记录告警并强制清理路由缓存，避免路由泄漏。

## 向后兼容

- 若旧插件仍使用旧注册方式，可在宿主层做过渡适配。
- 新插件统一按生命周期接口开发，避免并存双标准。
