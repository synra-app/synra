# 分阶段实施建议

按依赖从底到上推进，便于每步可测、可演示。

## Phase 1 — Manifest 与类型

- 固化 `package.json.synra` 类型与校验器；实现 `pluginId` 解析单元测试。
- 约定 UI `dist` 相对路径与最小必填字段。

## Phase 2 — 桌面安装闭环

- Registry GET + tarball 下载 + 哈希校验 + 解压 + install store。
- 桥接 `plugin.install` / `plugin.listInstalled` / `plugin.uninstall`。

## Phase 3 — 目录与发现

- 合并本地已装 + 内建；接入精选索引或按需 registry（按产品选的 [02](./02-discovery-and-catalog.md) 方案）。
- 实现 **包名识别**：全量合法 `packageName` 直查；否则对关键词 `q` 双查 `@synra-plugin/{q}` 与 `synra-plugin-{q}` 后合并去重（见 [02](./02-discovery-and-catalog.md)「包名识别与关键词双查」）。
- UI：`refreshCatalog`、关键词过滤；可选远程搜索。

## Phase 4 — 激活与运行时

- 渲染侧对 `entries.ui` 使用 **构建后 ESM** + 原生动态 `import()`；Node 侧对 `entries.host` 优先 `dist` 原生 `import()`，必要时经 [importx](https://github.com/antfu-collective/importx) 加载 TS/源码，且**必须**实现 [08-plugin-import-loader.md](./08-plugin-import-loader.md) 所述**单例**加载器与 `loadSynraPluginModule('host' | 'ui' | 'worker', …)` 契约（见 [04](./04-activate-and-runtime.md)）。
- 对照 [07-plugin-runtime-layers.md](./07-plugin-runtime-layers.md) 校验各子入口依赖边界；`worker` 绑定的执行环境在本阶段定案。
- `PluginHost` 路由前缀、`onPluginEnter` / `onPluginExit`；与 `plugin-sdk` 行为对齐（参见 [plugin-chat-sdk](../plugin-chat-sdk/)）。

## Phase 5 — 手机同步

- 定义并贯通 **`file.transfer.*`** 数据面（见 [file-transfer](../file-transfer/README.md)）：发送端从 `artifactRoot` 读 **`package.tgz`**（或等价位流），按协议分块后经 **`file.transfer.request` / `chunk` / `complete`** 发出，`payload.kind === 'plugin-bundle'`。
- 接收端：组包（如 `PluginBundleTransferAssembly`）、校验、落盘、复用 Phase 4 激活；可写目录抽象与错误面。
- **完成定义（可验收）**：端到端仅使用 **`file.transfer.*`**；实现中与 **`SYNRA-COMM::FILE_TRANSFER::*`** 注释一致（NodeId 索引见 [cross-platform-communication-map/README.md](../cross-platform-communication-map/README.md)）。

## Phase 6 — 观测、回滚与产品化

- 安装/同步失败可解释错误码；上一版保留与清理策略。
- 日志与可选遥测（不传敏感 tarball 内容）。

## 原则回顾

- **协议先行**：shared 类型 → 宿主 → 移动端 Handler。
- **传输不带业务**：device-connection 只管字节与消息，不解包内业务。
- **白名单 registry** 与**校验不过不激活**在每一阶段都不可省。
