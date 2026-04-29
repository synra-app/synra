# 前端设置：Plugin 页签与 npm 源

本文描述在 **Settings** 中增加 **Plugin** 页签的产品与配置约定，用于选择插件安装/发现时所使用的 **npm 兼容 registry** 基址。与桌面宿主安装中 `registryUrl` 的语义一致，见 [03-install-desktop-host.md](./03-install-desktop-host.md)。

## 信息架构

- 在 **Settings**（或等价的全局设置入口）中新增一级 **页签/分段**：**Plugin**。
- 与「账户」「外观」等并列；进入后主要展示**插件与 registry 相关**的选项，避免与设备连接等强耦合项混在同一长表单中。

## npm 源（可选项）

用户从**受控白名单**中选择一种镜像；保存后写入**持久化配置**（如 `preferences` / 本地 key-value），主进程在 `plugin.install` 或等效安装路径上读取，拼接到 npm 元数据与 tarball 请求（GET `{registry}/{encodeURIComponent(packageName)}` 等），**不**在渲染进程内直接发 registry 请求，除非经桥接与校验。

| 键（内部 id）     | 说明                  | 基址 URL                                      |
| ----------------- | --------------------- | --------------------------------------------- |
| `npm`（**默认**） | 官方 npm 源           | `https://registry.npmjs.org`                  |
| `taobao`          | npmmirror（原淘宝源） | `https://registry.npmmirror.com`              |
| `tencent`         | 腾讯镜像              | `https://mirrors.tencent.com/npm`             |
| `huawei`          | 华为云                | `https://repo.huaweicloud.com/repository/npm` |

说明：

- **去除 URL 尾斜杠**后参与拼接（与 [03](./03-install-desktop-host.md) 的 `normalize` 行为一致），避免 `//` 与重复 `encode` 问题。
- 默认项必须是 **`https://registry.npmjs.org/`** 的规范化结果（即上表 `npm` 行，无末尾 `/`）。
- 白名单**仅**包含上表几类，自定义 URL 若产品需要可在后续单开「高级」与风控策略，**不在**本文的最小集内强要求。

## 与后端的连接

- **渲染进程**：把用户选中的**内部 id 或**规范化后的 `registryBaseUrl` 经 **桥接** 写入 `preferences`（如 `synra.plugin.registry`），或只写 id 由主进程查表为 URL，避免在 Web 层写死多语言文案以外的逻辑。
- **主进程 / 安装服务**：读取该配置，在调用 registry 的每次请求中注入 `registryUrl`（或 `SYNRA_PLUGIN_REGISTRY_URL` 的等价物），与已有环境变量优先级策略需**单点约定**（例如：用户显式选择优先于未设置的 env）。

## 文案与无障碍

- 页签标题可展示为 **Plugin**（产品语言为英文时）或本地化标题；上表**镜像名**在 UI 中可显示为更友好的长名称，但**存储**仍建议用 `npm` / `taobao` / `tencent` / `huawei` 等稳定 id。
- 切换源后，可选提示「新安装与更新将使用所选源；已缓存包不受影响」类说明（具体由产品定）。

## 安全与合规

- 白名单内均为公开镜像；**不得**在未经审核的情况下允许任意用户输入 URL 作为 registry（否则存在供应链风险）。
- 与 [README](./README.md) 中「只从受信任 registry 拉取」原则一致；若需企业私有源，在扩展文档中单列。

## 与实现顺序

可在「桌面安装闭环」具备 `registryUrl` 参数后再做本 UI，以便端到端可测；参见 [06-implementation-phases.md](./06-implementation-phases.md)。
