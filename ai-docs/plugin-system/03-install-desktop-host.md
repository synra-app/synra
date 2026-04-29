# 桌面宿主安装

## 范围

在**信任 registry** 的前提下，将指定 `packageName` 与解析后的版本安装到宿主可写目录，并写入**持久化安装记录**，供渲染进程通过桥接拿到 `artifactRoot` 等摘要。

## 输入

- `packageName`：符合 [01-package-and-manifest.md](./01-package-and-manifest.md) 的包名规则。
- `version`：可选显式 SemVer；缺省时使用 `dist-tags.latest`（或等价策略）。
- `registryUrl`：可选；未给则使用环境/配置中的**白名单**默认 registry（如 `https://registry.npmjs.org` 或企业镜像）。**前端**在 Settings → Plugin 页签提供镜像白名单，见 [09-frontend-plugin-settings.md](./09-frontend-plugin-settings.md)。

## 主流程

1. **校验包名**：非法则拒绝，不向网络发请求。
2. **获取包元数据**：HTTP GET `{registry}/{encodeURIComponent(packageName)}`，得到 `versions` 与 `dist-tags`。
3. **解析版本**：若未指定 `version`，用 `dist-tags.latest`；若指定，从 `versions[version]` 取文档；解析失败则明确错误（无此版本、无 `latest` 等）。
4. **读取 `synra` 与 `pluginId`**：根据版本文档推导 `pluginId`，校验 manifest；不满足则拒绝安装。
5. **解析 tarball**：从 `versions[resolved].dist.tarball`（或等价字段）下载二进制。
6. **校验**：比对 `shasum` / `integrity`（若存在）与下载物；失败则删临时文件并退出。
7. **落盘路径**：建议 `~/.synra/plugins/<pluginId>/<resolvedVersion>/`（可配置）；先写入 `package.tgz`，再解压到 `package/` 子树，**strip** 顶层 `package` 目录或使用等效解压参数，使 `package.json` 相对 `artifactRoot/package` 或约定根即可发现。
8. **记录**：在 install store（如 JSON 文件或 DB）写入 `pluginId`、`packageName`、`version`、`artifactRoot`、`installedAt`、展示用元数据摘要、可选 `hash`。

## 输出（给 UI / 桥接）

- `PluginInstallResult`：至少包含 `pluginId`、`version`、`packageName`、`artifactRoot`、`installedAt`，以及激活侧需要的 `defaultPage`、`icon` 等展示字段。

## 桥接契约（建议形状）

方法名可映射为 `plugin.install`，载荷与结果类型在 shared 层定义，避免各端漂移。

- 错误：网络失败、非法包名、manifest 缺失、校验失败、磁盘满 —— 应区分**可重试**与**不可恢复**，便于 UI 提示。

## 卸载

- `plugin.uninstall`：按 `pluginId` 从 install store 删除，并级联删除 `artifactRoot` 树；若内建插件仅做「禁用」而非删文件，由 `builtin` 标记与产品规则决定。

## 与渲染进程的关系

渲染侧不直接写 `node_modules`；仅通过桥接完成安装后，拿到只读路径再执行 `import()`（见 [04-activate-and-runtime.md](./04-activate-and-runtime.md)）。

## Node 侧可选：importx 与构建产物

- **安装管线本身**仍以 npm registry **tarball**、解压与 install store 为准；不因加载方式改变校验规则。
- **主进程**在需要 importx 时，应经 [08-plugin-import-loader.md](./08-plugin-import-loader.md) 的**单例封装**与 `loadSynraPluginModule(layer, …)` 约定，而不是各处直接 `import('importx')`。
- **推荐**：正式环境下对已发布的 **`dist/host/index.mjs`**（或其它 manifest 声明路径）使用 **Node 原生 `import()`**；importx 更适合开发期或必须加载 `.ts` 的场景；细节见 [04-activate-and-runtime.md](./04-activate-and-runtime.md) 与 [08](./08-plugin-import-loader.md)。

## 安全

- Registry URL 必须来自**允许列表**或用户显式配置（企业场景）。
- 安装记录与磁盘路径只暴露给同进程信任边界内的渲染层。
