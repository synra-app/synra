# 插件 SDK 与插件发布指南（草案）

## 文档目标

本文件聚焦两个问题：

- 如何设计 `@synra/plugin-sdk`，让第三方插件能稳定接入运行时。
- 插件作为 npm 包发布时，如何兼顾跨平台（Android/iOS/Windows/macOS）能力边界。

本文件是 `plugin-runtime-design.md` 的补充，不替代主流程文档。

## 已确认决策

- 插件包产物：`ESM + CJS` 双产物。
- 兼容检查：运行时 `warn and best effort`（告警后尽力加载）。
- 平台声明：插件平台支持声明为可选项。
- 脚手架基线：参考 [initx-plugin-starter](https://github.com/initx-collective/initx-plugin-starter)。

## 设计原则

- 平台无关优先：插件本体尽量只做“输入理解 + 动作描述”。
- 角色优先：页面与流程按 `sender/receiver` 建模，不按设备类型写死。
- 平台能力下沉：系统能力调用由宿主 adapter 负责，不放在插件中。
- 契约先行：先稳定类型与消息语义，再扩展插件能力。
- 失败可解释：插件输出错误必须结构化，便于端侧 UI 映射。
- PC 统一分发：插件安装与规则配置以 PC 为中心，其他设备通过会话同步获取。

## 包角色与分层

```mermaid
flowchart LR
  pluginPkg[NpmPluginPackage] --> sdkPkg[@synra/plugin-sdk]
  runtimePkg[@synra/plugin-runtime] --> sdkPkg
  runtimePkg --> protocolPkg[@synra/protocol]
  hostAdapter[HostActionAdapter] --> runtimePkg
```

分层建议：

- `plugin package`：规则、解析、动作构建、执行逻辑（不直接碰平台 API）。
- `plugin-sdk`：类型定义、辅助工具、兼容层。
- `plugin-runtime`：注册、调度、隔离执行、超时、回执。
- `host adapter`：浏览器打开、文件操作等系统调用。

## 插件 npm 包建议结构

```txt
my-synra-plugin/
  src/
    index.ts
    plugin.ts
    actions.ts
    matcher.ts
  package.json
  README.md
  CHANGELOG.md
  LICENSE
```

`package.json` 建议字段：

- `name`: `@scope/synra-plugin-xxx`（建议命名规范）
- `version`: 语义化版本
- `type`: `module`
- `main` / `module` / `types`
- `exports`（显式导出入口）
- `peerDependencies`
  - `@synra/plugin-sdk`
- `keywords`
  - `synra`
  - `synra-plugin`

插件元信息约定（直接写在 `package.json`）：

- 使用 `synraPlugin` 顶层字段承载插件元信息，不单独新增 manifest 文件。
- 推荐最小字段：
  - `apiVersion`: 插件 API 版本（用于 runtime 兼容检查）
  - `platforms`: 可选，声明支持平台
  - `actionTypes`: 插件可能产出的动作类型
  - `displayName`: 面向用户显示名
  - `defaultRole`: 默认角色（`sender` 或 `receiver`）

示例：

```json
{
  "name": "@scope/synra-plugin-github-open",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "peerDependencies": {
    "@synra/plugin-sdk": "^1.0.0"
  },
  "synraPlugin": {
    "apiVersion": "1.0",
    "displayName": "Github Open",
    "platforms": ["android", "ios", "windows", "macos"],
    "actionTypes": ["open-url"],
    "defaultRole": "sender"
  }
}
```

产物建议：

- 默认输出 `esm` + `cjs`。
- `exports` 同时提供 `import` 与 `require` 路径。

## SDK 契约建议（对插件作者公开）

以 `plugin-runtime-design.md` 中已定义接口为基础，建议稳定以下最小集合：

- `SynraPlugin`
- `ShareInput`
- `PluginMatchResult`
- `PluginAction`
- `ExecuteContext`
- `PluginExecutionResult`

补充建议：

- `PluginMeta`：展示名、描述、作者、支持输入类型、文档链接。
- `PluginCapability`：声明本插件产出的 `actionType` 范围（用于 UI 展示，不作为权限系统）。

## 跨平台支持策略

### 核心思想：插件跨平台，动作适配器分平台

- 插件输出通用动作描述（`actionType + payload`）。
- 运行时将动作路由到宿主 adapter。
- 各平台实现各自 adapter，但遵守同一动作契约。

### 分发模型：PC 作为插件源

- PC 安装插件后维护本地插件目录与规则配置。
- 其他设备连接 PC 后，通过协议拉取插件清单、插件包、规则。
- 设备侧插件缓存只作为加速层，版本与规则以 PC 为准。

### 推荐动作分层

- 通用动作（跨平台可实现）：
  - `open-url`
  - `copy-text`
  - `show-notification`
- 条件动作（部分平台可实现）：
  - `open-file`
  - `launch-app`
  - `simulate-shortcut`

### 平台不支持时的行为

- adapter 返回结构化失败：`{ code, message }`。
- 失败码建议：`ADAPTER_NOT_SUPPORTED`。
- UI 给出“当前平台暂不支持该动作”提示。

## 兼容性与版本策略

### SDK 兼容策略

- 插件与 `@synra/plugin-sdk` 采用 `peerDependencies`。
- 建议在插件中声明兼容区间，如 `^1.0.0`。
- SDK major 变更视为 breaking change，插件需明确适配。

### 运行时兼容策略

- `plugin-runtime` 加载插件时检查：
  - `peerDependencies["@synra/plugin-sdk"]` 是否与当前 runtime 兼容。
  - `package.json.synraPlugin.apiVersion` 是否在运行时支持列表。
- 不兼容时默认“告警 + 尽力加载”；若关键能力缺失再降级拒绝加载。

### 规则配置来源

- 默认规则可由插件在 `package.json.synraPlugin.defaultRules` 提供。
- 实际生效规则由 PC 侧管理并下发，覆盖默认规则。
- 设备不得直接提升规则版本，仅允许读取或请求刷新。

## 发布与质量门禁

### 发布前清单（插件作者）

- 类型检查通过。
- 单测通过（matcher/action/execute）。
- README 含安装、配置、支持平台、示例输入输出。
- 标注不支持的平台与 fallback 行为。

### 最小测试矩阵建议

- 输入维度：text/link/file。
- 行为维度：matched/not matched。
- 结果维度：success/failed/cancelled。
- 平台维度：至少 1 个 mobile + 1 个 desktop 适配验证。

## 安全与稳定性建议

- 插件不得直接访问宿主原生对象。
- 对 `payload` 做 schema 校验（至少运行时校验）。
- 执行必须可中断（超时中止）。
- 严禁在 `supports()` 做网络副作用或重计算阻塞。

## 建议的插件作者体验（DX）

- 提供 `createSynraPlugin()` helper，降低模板代码。
- 提供 `@synra/plugin-sdk/testing` 测试工具。
- 提供官方脚手架（后续可用 `vp create` 模板）。

## 后续可扩展方向（非 MVP）

- 基于 `package.json` 元信息的签名与来源校验。
- 插件市场与分发索引。
- 插件权限声明与用户授权流。
- 平台能力探测 API（插件可主动降级行为）。
- 可选的平台能力声明规范（`package.json.synraPlugin` 字段标准化）。

## 与现有文档关系

- 主流程：`app.md`
- 协议：`cross-device-transport.md`
- 运行时：`plugin-runtime-design.md`
- 包边界：`package-splitting.md`
- 契约索引：`contracts-index.md`
