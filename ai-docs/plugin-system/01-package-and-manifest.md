# 包与 manifest 约定

## 包名

实现层应**只**接受以下两种形式（与 [plugin-chat-sdk 约束](../plugin-chat-sdk/README.md) 一致）：

- Scope 形式：`@synra-plugin/<plugin-id>`，例如 `@synra-plugin/chat`。
- 无 scope 形式：`synra-plugin-<plugin-id>`，例如 `synra-plugin-notes`。

`<plugin-id>` 与 `pluginId` 对应，字符集为 `a-z`、`0-9`、`-`；包名其余部分大小写与拼写按发布端统一，解析时转小写或严格匹配需实现上定案并全链一致。

## `pluginId` 推导

- 从 `@synra-plugin/x` 得到 `pluginId = x`。
- 从 `synra-plugin-x` 得到 `pluginId = x`（`x` 为去掉前缀后的整段）。

`pluginId` 是目录键、同步消息、本地安装记录中的**主键**。

## `package.json` 与 `synra` 段

元信息**不**使用独立 `manifest.json` 文件；以 `package.json` 为真值，其中 `synra` 扩展宿主所需字段（标题、默认页、图标、builtin 标记、可选 entries 等）。具体字段集合由 `plugin-system` / SDK 的类型定义约束，实现时以**单处**类型为源生成校验器。

## 版本

- 以 **SemVer 字符串**与 **registry 的 `dist-tags`** 为安装解析依据（如 `latest` 与显式版本号）。
- 运行时要能同时比较**已安装版本**与**目录声明版本**，以决定是否提示更新或触发增量同步。

## 构建产物布局（约定）

宿主期望能从解压目录解析出 UI 入口（例如 `package/dist/ui/index.mjs`）；确切相对路径由 manifest `synra.entries` 或固定约定给出，实现须在激活阶段失败时给出可读错误（路径不存在、导出不是构造函数等）。

## 实现校验清单

发布或 CI 侧可对插件包跑静态校验：

- [ ] `name` 符合两种合法模式之一。
- [ ] `synra` 必填字段齐全（至少包含宿主路由与展示所需项）。
- [ ] `version` 合法 SemVer。
- [ ] `dist` 产物存在且入口可被宿主解析。

独立 npm 包（如 `@synra-plugin/chat`）满足上述约束后即可进入通用安装管线，无需宿主硬编码包名。
