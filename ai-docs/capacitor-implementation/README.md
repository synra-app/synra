# Synra Capacitor Mobile Implementation

整理日期：2026-04-16

本文档是 Synra 移动端接入 Capacitor 的总入口，目标是让 `apps/frontend`（Web）与 `apps/mobile`（Capacitor 容器）形成稳定、可复现、可交接的工程链路。

## 目录分层

- 通用文档：`ai-docs/capacitor-implementation/`
- Android 专项：`ai-docs/capacitor-implementation/android/`
- iOS 专项：`ai-docs/capacitor-implementation/ios/`

## 目标与范围

范围内：

- `frontend` 与 `mobile` 的职责边界
- Capacitor 初始化、配置与同步流程
- `frontend/dist -> mobile/www -> cap sync` 标准链路
- Android / iOS 的平台对接入口与执行顺序

范围外：

- Electron 宿主实现（参见 `ai-docs/capacitor-electron-implementation`）
- 跨端主流程设计（参见 `ai-docs/main`）

## 推荐阅读顺序

1. 本文档（通用总览）
2. `checklist.md`（通用执行清单）
3. `android/README.md` 与 `android/checklist.md`
4. `ios/README.md` 与 `ios/checklist.md`

## 架构与职责

```text
apps/
  frontend/   # 负责页面开发和 Web 构建产物
  mobile/     # 负责 Capacitor 配置和原生平台工程
```

职责划分：

- `apps/frontend`
  - 负责业务页面与 Web 资源打包
  - 输出 `dist`
- `apps/mobile`
  - 负责 Capacitor 配置（含 `webDir`）
  - 负责 `android/` 与 `ios/` 工程
  - 消费 `www` 目录中的 Web 产物

## 标准实施流程

### 1) 初始化 Capacitor 工程

在 monorepo 下准备 `apps/mobile`，安装 Capacitor 运行时与 CLI，然后初始化工程：

```bash
vp add --filter mobile @capacitor/core @capacitor/android @capacitor/ios
vp add --filter mobile -D @capacitor/cli
vp exec --filter mobile cap init
```

初始化阶段建议固定：

- App Name：`Synra`
- App ID：`com.synra.app`
- Web Dir：`www`

### 2) 固化配置基线

Capacitor 配置文件中必须保持：

```ts
webDir: 'www'
```

这保证 `mobile` 工程不依赖跨目录相对路径，避免原生 IDE/CI 对路径解析不一致。

### 3) 建立 Web 产物同步链路

先构建 `frontend`，再将产物同步到 `mobile/www`：

```text
apps/frontend/dist -> apps/mobile/www
```

建议把“构建 + 同步 + sync”固化为统一脚本，减少人工操作分叉。

### 4) 执行 Capacitor 同步

在 `apps/mobile` 完成 `cap sync`，把当前 Web 产物和原生依赖更新进平台工程。

### 5) 进入平台流程

- Android：见 `android/README.md`
- iOS：见 `ios/README.md`

## 日常开发建议

建议每次原生联调都遵循同一顺序：

1. Web 构建
2. 产物同步到 `www`
3. `cap sync`
4. 打开原生 IDE 运行

保持“单一流程”是降低联调问题与环境差异成本的关键。

## 常见问题（通用）

### Q1：为什么不直接用 `../frontend/dist` 作为 `webDir`？

可以，但不推荐作为团队默认方案。  
使用 `www` 中转目录能让 `apps/mobile` 成为独立边界，原生工具链、CI、后续拆分更稳定。

### Q2：`cap sync` 后页面没更新？

优先检查：

1. `frontend` 是否重新构建
2. `dist` 是否已覆盖到 `mobile/www`
3. 运行的是否是最新同步后的原生工程

### Q3：Windows 下 iOS 为什么无法继续？

iOS 原生构建依赖 macOS + Xcode。  
Windows 可先完整打通通用链路与 Android 流程。

## 与历史文档关系

原 `ai-docs/capacitorjs-integration` 已迁移到本目录。  
后续请仅在 `capacitor-implementation` 维护与扩展。
