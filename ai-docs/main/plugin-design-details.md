# Plugin 设计细节

## 目标

本文件用于细化以下插件设计问题：

- 插件页面结构（`home`、`config` 等）；
- UI 与运行时代码的打包形态；
- 页面从 PC 到手机端的分发模型；
- 执行边界与安全约束。

默认前提：

- 插件以 npm 包形式发布；
- PC 是插件和规则的权威来源；
- 端角色由场景决定，不按设备类型写死。

## 1. 支持页面的插件结构

推荐源码结构：

```txt
my-synra-plugin/
  src/
    index.ts
    plugin.ts
    matcher.ts
    actions.ts
    pages/
      sender/index.vue
      receiver/index.vue
      config/index.vue
  package.json
```

### 页面入口约定

- `pages/sender`：发送端页面（发起动作/选择目标/提交请求）。
- `pages/receiver`：接收端页面（展示待处理请求/确认执行/状态反馈）。
- `pages/config`：配置页（规则、参数、映射关系）。
- 页面按“角色”而非“设备”命名，避免把手机或电脑写死。

### 角色选择规则

- 进入插件后先选择当前角色：`sender` 或 `receiver`。
- 默认角色可在插件配置中设置，但用户可在页面中临时切换。
- 同一设备在不同场景可切换角色（例如手机既可做发送端，也可做接收端）。

页面元信息统一声明在 `package.json.synraPlugin.pages`。

## 2. 构建产物策略

### 源码形态

- 页面使用 Vue SFC（`.vue`）开发。

### 打包目标

- 页面编译为 JS 模块（例如 `export default defineComponent(...)`）。
- 静态资源（css/icon/chunk）与资源清单一起输出。
- 插件包同时产出：
  - ESM（`.mjs`）
  - CJS（`.cjs`）

### 运行时消费

- PC 运行时加载插件逻辑（匹配、动作执行）。
- 手机运行时加载同步后的页面 bundle 并本地渲染。

## 3. `package.json` 页面契约

建议在 `package.json` 中扩展：

```json
{
  "synraPlugin": {
    "apiVersion": "1.0",
    "displayName": "Example Plugin",
    "platforms": ["android", "ios", "windows", "macos"],
    "actionTypes": ["open-url"],
    "pages": {
      "sender": "./dist/pages/sender.js",
      "receiver": "./dist/pages/receiver.js",
      "config": "./dist/pages/config.js"
    },
    "defaultRole": "sender",
    "assetsManifest": "./dist/pages/assets-manifest.json"
  }
}
```

## 4. 角色页面如何分发到设备（固定方案）

页面分发固定采用混合模式：

- 主路径：建连时由 PC 下发页面 bundle 与资源元信息，设备本地缓存渲染。
- 回退路径：当本地 bundle 缺失、版本过期或校验失败时，向 PC 请求补拉页面资源。

采用该方案的原因：

- 兼顾响应速度与可靠性；
- 与“PC 作为插件与规则权威源”一致；
- 便于通过版本号与 checksum 做一致性校验与更新。

## 5. 页面同步协议要求

页面同步元信息建议至少包含：

- 插件版本（plugin version）；
- 页面 bundle 版本；
- 资源 checksum；
- 页面入口映射表。

建议行为：

1. 设备请求插件清单；
2. PC 返回插件与页面 bundle 元数据；
3. 设备按版本/checksum 比较本地缓存；
4. 设备按需拉取缺失或过期文件；
5. 设备以原子方式切换到新 bundle。

## 6. 页面渲染运行时约束

- 设备端在受控 webview/sandbox 中运行插件页面；
- 仅暴露白名单 bridge API（禁止直接访问原生对象）；
- 页面到宿主的调用必须走类型化桥接契约；
- 每个页面生命周期具备超时与错误边界处理。

## 7. 规则配置与页面关系

- 规则在 PC 端存储并做版本化；
- `config` 页面通过结构化 schema 编辑规则；
- 设备保存配置后提交规则更新请求给 PC；
- PC 校验并持久化新规则版本，再同步给设备。

## 8. 安全与完整性

- 启用前必须校验页面 bundle 的 checksum；
- 校验失败直接拒绝激活；
- 插件执行与页面渲染要和主应用关键上下文隔离；
- 禁止页面运行时加载任意未授权远程脚本。

## 9. MVP 与后续演进

MVP：

- 建连同步页面 bundle；
- 设备本地缓存渲染页面；
- 规则由 PC 统一管理和下发。

后续：

- 插件包签名；
- 增量差分同步；
- 插件市场与分发索引。

## 10. 推荐落地基线

- 插件元信息统一放在 `package.json.synraPlugin`；
- 页面从 Vue SFC 构建为 JS 模块入口；
- 页面分发采用混合模式（同步优先，服务回退）；
- PC 始终作为插件与规则版本的权威源。
