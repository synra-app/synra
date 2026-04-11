# Synra Monorepo 集成 Capacitor JS 方案说明

整理日期：2026-04-11

这份文档基于 Capacitor 官方文档当前默认版本 `v8`，并结合当前仓库结构整理而成。

## 目标架构

这次采用的不是把 Capacitor 直接放进 `apps/frontend`，而是拆成单独的 `apps/mobile`：

```text
apps/
  frontend/   # 纯 Web 前端，继续负责页面开发与构建
  mobile/     # Capacitor 容器工程，负责 android/ios 与原生同步
```

职责划分如下：

- `apps/frontend`
  - 保持现有 Vite+ 前端项目
  - 负责生成 Web 构建产物 `dist`
- `apps/mobile`
  - 负责 Capacitor 配置
  - 负责 `android` 和 `ios` 原生工程
  - 负责接收前端构建产物并提供给 Capacitor

## 为什么选择 `apps/mobile + www` 方案

理论上，`apps/mobile` 中的 `webDir` 也可以直接指向 `../frontend/dist`。  
这次不采用这种方式，而是改用中转目录：

- 先构建 `apps/frontend/dist`
- 再把产物复制到 `apps/mobile/www`
- 最后让 Capacitor 使用 `apps/mobile/www`

这样做的原因是：

- `mobile` 的边界更清晰，不依赖跨目录相对路径
- Android Studio、Xcode、CI 更容易理解和维护
- 后续如果 `mobile` 需要独立演进，结构更稳
- 原生工程始终只依赖 `apps/mobile` 自己的目录内容

因此本方案的关键结论是：

- Capacitor 项目放在 `apps/mobile`
- Capacitor 的 `webDir` 设为 `www`
- `www` 的内容来自 `apps/frontend/dist`

## 这个仓库里的命令约定

虽然底层包管理器是 `pnpm`，但这个仓库里应优先使用 `vp`：

- 用 `vp add` 安装依赖
- 用 `vp exec cap ...` 调用 Capacitor CLI

不建议直接使用：

- `pnpm add ...`
- `npx cap ...`

## 推荐的接入顺序

你特别强调的一点是正确的：  
整体流程应当先使用 Capacitor v8 CLI 初始化 `apps/mobile`，再继续后面的关联和同步工作。

因此推荐顺序如下：

1. 先创建 `apps/mobile`
2. 在 `apps/mobile` 中安装 Capacitor v8 所需依赖
3. 先用 Capacitor CLI 初始化 mobile 项目
4. 再配置 `webDir`
5. 再补充前端构建产物复制流程
6. 最后添加 Android / iOS 平台

## 详细步骤

### 1. 创建 `apps/mobile`

先在 `apps/` 下创建新的 `mobile` 目录，并准备一个最基础的 `package.json`。

这个包的主要职责不是开发 Web 页面，而是承载 Capacitor 与原生工程。

### 2. 给 `mobile` 安装 Capacitor 依赖

建议从仓库根目录执行：

```bash
vp add --filter mobile @capacitor/core @capacitor/android @capacitor/ios
vp add --filter mobile -D @capacitor/cli
```

依赖说明：

- `@capacitor/core`：Capacitor JavaScript 运行时
- `@capacitor/cli`：Capacitor CLI
- `@capacitor/android`、`@capacitor/ios`：原生平台包

## 3. 优先使用 Capacitor v8 CLI 初始化 `apps/mobile`

在 `apps/mobile` 目录中执行：

```bash
cd apps/mobile
vp exec cap init
```

初始化时建议填写：

- App name：`Synra`
- App ID：`com.synra.app`
- Web assets directory：`www`

这里最重要的是：

- 先把 `mobile` 初始化成一个标准 Capacitor 项目
- 不要一开始就把它绑定到 `frontend/dist`
- 先让 Capacitor 的目录、配置、CLI 流程跑通

初始化完成后，`apps/mobile` 下应出现 Capacitor 配置文件。

## 4. 配置 `webDir` 为 `www`

初始化完成后，确认 Capacitor 配置中的核心字段类似下面这样：

```ts
webDir: "www";
```

这代表 Capacitor 消费的是 `apps/mobile/www`，而不是直接读取 `apps/frontend/dist`。

## 5. 增加前端产物复制流程

接下来再建立 `frontend -> mobile` 的连接关系：

1. 先构建 `apps/frontend`
2. 将 `apps/frontend/dist` 的内容复制到 `apps/mobile/www`
3. 再执行 `cap sync`

也就是说，这里的“关联”不是通过 `webDir` 直接跨目录引用，而是通过一层显式复制完成。

推荐形成一个明确流程：

```text
apps/frontend/dist -> apps/mobile/www -> capacitor sync
```

## 6. 添加原生平台

在 `apps/mobile` 下执行：

```bash
vp exec cap add android
vp exec cap add ios
```

说明：

- Windows 环境下建议优先验证 Android
- iOS 原生构建仍然需要 macOS 和 Xcode

## 推荐的日常开发流程

完成接入后，建议采用下面的顺序：

1. 构建前端
2. 复制前端构建产物到 `apps/mobile/www`
3. 执行 Capacitor 同步
4. 打开 Android Studio 或 Xcode

可抽象为：

```text
frontend build -> copy to mobile/www -> cap sync -> open native project
```

后续可以在 `apps/mobile` 里补充脚本，把这几个步骤串起来。

## 为什么不先直接绑定 `frontend/dist`

虽然 Capacitor 可以配置跨目录的 `webDir`，但本方案不建议这么做，原因有：

- `apps/mobile` 会对 `apps/frontend` 的目录结构产生强耦合
- 原生工程依赖跨目录相对路径，后续更脆弱
- 团队协作和 CI 中更容易出现“构建产物从哪里来”的歧义
- 独立维护 `mobile` 时不够干净

所以当前方案的重点是：

- 先初始化一个标准的 `apps/mobile`
- 再通过复制构建产物完成与前端的连接

## 基于官方文档整理的环境要求

根据 2026-04-11 查阅到的官方文档：

- Node.js 需要 `22+`
- Android 需要 Android Studio 和 Android SDK
- Capacitor 8 文档中提到 Android Studio 最低要求是 `2025.2.1`
- iOS 需要 macOS、Xcode 和 Xcode Command Line Tools
- Capacitor 8 文档中提到 Xcode 最低要求是 `26.0`

当前仓库通过 `vp --version` 显示 Node.js 为 `v24.14.1`，已经满足 Capacitor 的 Node 要求。

## 建议的落地顺序

对当前仓库，建议按下面顺序推进：

1. 新建 `apps/mobile`
2. 在 `apps/mobile` 中安装 Capacitor 依赖
3. 用 Capacitor v8 CLI 初始化 `apps/mobile`
4. 确认 `webDir` 为 `www`
5. 增加 `frontend/dist -> mobile/www` 的复制逻辑
6. 添加 Android
7. 验证 `build -> copy -> sync -> open android`
8. 如果后续需要，再补充 iOS

## 参考来源

- 官方安装文档：https://capacitorjs.com/docs/getting-started
- 官方环境准备文档：https://capacitorjs.com/docs/getting-started/environment-setup
- 官方工作流文档：https://capacitorjs.com/docs/basics/workflow
