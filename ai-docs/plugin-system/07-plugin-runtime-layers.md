# 插件运行时分层（Host / UI / Worker / Shared）

本节约定**单个 Synra 插件包**内部的子入口职责与依赖边界，不以仓库现状为准；实现可参考发布包 [@synra-plugin/chat](https://www.npmjs.com/package/@synra-plugin/chat)（源码：[synra-app/synra-plugin-chat](https://github.com/synra-app/synra-plugin-chat)）。

## manifest 约定

在 `package.json` 中用 `synra.entries`（或与 `exports` 对齐的同构映射）列出宿主需要识别的入口：

- `host` — Node 侧宿主加载。
- `ui` — 渲染进程加载（通常为 `dist/ui/**/*.mjs`）。
- `worker` — 由宿主按「worker 运行时契约」挂载（进程形态见下文）。
- `shared` — 可多环境复用的模块（类型、纯函数、常量）。

宿主解析路径时优先读安装产物下的最终文件（发布后一般为 `dist/**`）。

## 分层边界

| 入口       | 典型职责                                                             | 允许的依赖形态                                                                                                                                                                                                    |
| ---------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **host**   | 向宿主注册 action、连接 bridge/IPC、与主进程服务协作                 | **Node 全量 npm**、Node 内置模块、与 `plugin-sdk` 的主进程侧 API                                                                                                                                                  |
| **ui**     | Vue 页面、组件、与 `plugin-sdk` 的 UI 层                             | **仅浏览器/前端**向：框架、组件、浏览器 API；**不**假设 Node `fs` 等（需经桥接）                                                                                                                                  |
| **worker** | 与 `plugin-sdk` 约定的**长任务 / 隔离执行**契约                      | 依**实际挂载环境**而定：若在 **Web Worker** 中则禁止 Node 专用包；若在**主进程子上下文**中则可与 host 类似。具体以产品选定的 runtime 为准，**须在宿主文档中单点说清** `synra.entries.worker` 绑定到何种执行环境。 |
| **shared** | 跨 `host` / `ui` / `worker` 的**纯逻辑**、类型、事件名、小型无环工具 | **不**放仅单端可用的 API；若必须分支，用**显式环境门**或拆文件。                                                                                                                                                  |

## 与「shared 协议包」的区别

- 本节的 **shared** 指**插件仓库内**的 `src/shared` 子包。

- monorepo 里的 **packages/protocol** 等属于**应用级**协议；插件的 `shared` 只服务**本插件**的复用，二者不要混名。

## 参考包结构（@synra-plugin/chat）

公开 `package.json` 中含多子路径 `exports`（开发指向 `src/*`，发布指向 `dist/*`），且 `synra.entries` 含 `ui` / `host` / `worker` / `shared` 四条。实现目录、构建与版本发布流程时，可直接对照该仓库的 `vp pack` 布局。

## 与 importx 加载器

在 Node 内用 importx 按 `host` / `ui` / `worker` 子入口**动态加载**时，统一走 [08-plugin-import-loader.md](./08-plugin-import-loader.md) 的封装约定（进程内**单例** `importx` 模块、显式 `layer` 与 `parentURL` 规则）。**`shared`** 不作为该加载器的第一类 `layer`，由子入口的模块图自然 `import`。
