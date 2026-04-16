# Synra Capacitor Android Implementation

整理日期：2026-04-16

本文档用于承接 Android 平台特有实现步骤，默认前提是你已经完成上层通用流程：

- `../README.md`
- `../checklist.md`

## 平台前置条件

- 可用的 Android Studio 与 Android SDK
- Java/Gradle 环境满足当前 Capacitor 要求
- `apps/mobile` 已是可同步的 Capacitor 工程

建议最低检查项：

- Android SDK Platforms、Build-Tools 已安装
- Android Emulator 或真机调试链路可用
- Android Studio 可正常完成 Gradle Sync

## 与通用流程的衔接

Android 阶段开始前，应已完成：

1. `apps/frontend/dist` 可稳定产出
2. `dist -> apps/mobile/www` 同步链路可执行
3. `cap sync` 基础流程无错误

## Android 实现主线（可执行）

### 1) 添加平台

在 `apps/mobile` 下执行：

```bash
vp exec cap add android
```

首次执行后应产生 `apps/mobile/android`。

### 2) 同步平台

在每次 Web 资源更新后执行：

```bash
vp exec cap sync android
```

### 3) 打开 Android Studio

```bash
vp exec cap open android
```

### 4) 在 IDE 内完成运行验证

最小验证目标：

1. Gradle Sync 成功
2. 可选中一个运行设备（模拟器或真机）
3. App 可安装并启动
4. 页面加载与 Web 版本一致

## 日常联调建议

建议固定以下顺序，避免“改了前端但原生没更新”：

1. 重新构建 `frontend`
2. 同步 `dist -> mobile/www`
3. 执行 `cap sync android`
4. 在 Android Studio 运行

## 验收关注点

- `apps/mobile/android` 目录结构完整
- Gradle Sync 成功
- App 可以启动并加载 Web 页面
- 基础桥接能力在 Android 环境可调用
- 前端改动可在 Android 端复现

## 常见问题

### Q1：`cap open android` 无法打开 IDE

优先检查 Android Studio 是否已正确安装，并可手工打开任意工程。

### Q2：Gradle Sync 失败

优先检查：

- Android SDK 路径是否正确
- JDK 版本是否匹配
- 当前网络是否影响 Gradle 依赖下载

### Q3：运行后页面仍是旧版本

优先检查：

1. `frontend` 是否重新构建
2. `www` 是否已更新
3. 是否执行了 `cap sync android`
