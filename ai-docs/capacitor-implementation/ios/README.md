# Synra Capacitor iOS Implementation

整理日期：2026-04-16

本文档用于承接 iOS 平台特有实现步骤，默认前提是你已经完成上层通用流程：

- `../README.md`
- `../checklist.md`

## 平台前置条件

- macOS 开发环境
- 已安装并可用的 Xcode 与 Command Line Tools
- Apple Developer 账号能力（用于真机签名与发布）
- `apps/mobile` 已是可同步的 Capacitor 工程

建议最低检查项：

- Xcode 可创建并运行基础 iOS App 工程
- 至少可用一个 iOS Simulator 运行目标
- 如需真机调试，已配置开发者团队与证书

## 与通用流程的衔接

iOS 阶段开始前，应已完成：

1. `apps/frontend/dist` 可稳定产出
2. `dist -> apps/mobile/www` 同步链路可执行
3. `cap sync` 基础流程无错误

## iOS 实现主线（可执行）

### 1) 添加平台

在 `apps/mobile` 下执行：

```bash
vp exec cap add ios
```

首次执行后应产生 `apps/mobile/ios`。

### 2) 同步平台

在每次 Web 资源更新后执行：

```bash
vp exec cap sync ios
```

### 3) 打开 Xcode

```bash
vp exec cap open ios
```

### 4) 在 IDE 内完成运行验证

最小验证目标：

1. 工程可编译
2. 至少一个运行目标可启动（Simulator 或真机）
3. App 可加载最新 Web 页面
4. 基础桥接能力可调用

## 日常联调建议

建议固定以下顺序：

1. 重新构建 `frontend`
2. 同步 `dist -> mobile/www`
3. 执行 `cap sync ios`
4. 在 Xcode 运行目标设备

## 验收关注点

- `apps/mobile/ios` 目录结构完整
- Xcode 工程可打开、可编译
- 模拟器或真机可启动并加载 Web 页面
- 基础桥接能力在 iOS 环境可调用
- 前端改动可在 iOS 端复现

## 签名与发布占位

进入提测/发布阶段时，需额外完成：

- Signing & Capabilities 与 Team 对齐
- Bundle Identifier 与环境映射对齐
- Archive 产物可生成
- TestFlight 分发流程可验证

## 常见问题

### Q1：`cap open ios` 后 Xcode 工程异常

优先检查是否在 `apps/mobile` 执行命令，以及 `cap sync ios` 是否成功。

### Q2：真机运行提示签名问题

优先检查 Team、Provisioning Profile、Bundle Identifier 是否一致。

### Q3：运行后页面不是最新版本

优先检查：

1. `frontend` 是否重新构建
2. `www` 是否已更新
3. 是否执行了 `cap sync ios`
