# 状态与事件流规范

本文档定义前端状态来源、事件处理路径与错误处理规则，确保 `Home/Plugins/Devices/Settings` 四页行为一致。

## 状态分层

## 全局状态（Pinia）

来源建议：

- `useLanDiscoveryStore`（设备能力与通信主状态，基于 `useTransport`）
- `usePluginCatalogStore`（插件列表，后续）
- `useAppShellStore`（壳层布局状态）

关键状态分组：

- 设备态：`scanState`、`peers`、`connectedDeviceIds`
- 插件态：`plugins`、`keyword`、`builtinInstalled`
- 壳层态：`sidebarCollapsed`、`activeMenu`
- 诊断态：`error`、`eventLogs`

## 页面本地状态

- `home`：通常无本地业务状态，仅展示 `version`
- `plugins`：`keyword`、局部排序/过滤状态
- `devices`：`selectedDeviceId`
- `settings`：诊断复制反馈、刷新状态
- 页面本地状态应只保留临时输入，不重复持久化全局通信状态。

## 事件来源

- 主动请求：
  - `startScan`、`stopScan`、`refreshPeers`
  - `sendToDevice`、`broadcast`
  - `searchPlugins`（首版可仅本地过滤）
- 被动监听：
  - `deviceConnectableUpdated`
  - `sessionOpened`、`sessionClosed`（内部事件，不对业务暴露 session 语义）
  - `messageReceived`
  - `transportError`

## 数据流规则

1. 页面触发 action（通过 store）。
2. store 更新状态并写入日志。
3. 页面通过 `storeToRefs` 响应式刷新 UI。
4. 日志与错误态集中在 `Devices/Settings`，`Home/Plugins` 保持轻量表达。
5. 页面层不直接消费 `hostEvent`，统一消费已归一化的 domain 事件。

## 设备与连接状态规范

- 设备连接状态以 `connectedDeviceIds` 为单一来源。
- 页面不得维护额外 session 缓存，避免与 store 脱节。
- 页面交互只基于 `deviceId`：
  - 连接设备
  - 断开设备
  - 向设备发送消息

## 错误语义与用户动作

- 错误提示必须可恢复：至少提供重试、重连或返回连接页。
- 设备不可达、发送失败等错误应阻断后续动作并立即反馈。
- 插件列表页错误（例如图标加载失败）应优先回退，不阻断整个页面渲染。

## 插件宿主状态规范

- 前端宿主统一使用 `PluginHostFacade` 进行注册、激活、停用与页面挂载。
- 路由绑定、生命周期切换、页面注册拆分为独立职责类（Registry/Lifecycle/RouteBinder）。
- 插件页与平台能力交互必须通过能力端口适配层，不直接调用原生桥。

## 插件列表状态规范

- `chat` 作为内置插件，默认在列表展示为已安装。
- 插件图标加载优先 `logo.png`，失败自动回退 UnoCSS icon。
- 搜索输入为空时展示全部插件；有关键字时仅本地过滤匹配项（首版）。

## 推荐 Composables（后续）

- `useSidebarState`：侧栏收缩状态与动画开关。
- `usePluginList`：插件搜索、排序、图标回退策略。
- `useDiscoveryActions`：发现、连接与消息发送动作组合封装。
- `usePluginHost`：宿主能力外观与页面生命周期组合封装。
- `useSettingsDiagnostics`：诊断信息刷新与复制反馈。

## 验收清单

- 页面刷新后能恢复设备与插件列表关键状态。
- 事件监听只注册一次，避免重复追加日志。
- `Home/Plugins/Devices/Settings` 的状态来源边界清晰，无重复缓存。
- 同一类状态在不同页面表达一致（尤其 success/error 语义色映射）。
- 插件导航切换时，离开的插件实例可正确触发停用与路由卸载。
