# Capacitor iOS 实施清单

工作区：`D:/Projects/synra-monorepo`

适用范围：`ai-docs/capacitor-implementation/ios`

## 使用说明

- 执行本清单前，先完成上层通用清单。
- 本清单只覆盖 iOS 平台特有动作。
- iOS 原生流程需在 macOS 环境执行。
- 建议每次执行都记录命令、时间、结果，便于回溯。

## A. 平台准备

- [ ] macOS 与 Xcode 环境可用
- [ ] Xcode Command Line Tools 已安装
- [ ] Apple Developer 账号与签名能力可用
- [ ] `apps/mobile` 已包含有效 Capacitor 配置
- [ ] 至少一个 Simulator 运行目标可用

## B. 平台创建与同步

- [ ] 执行 `cap add ios` 成功
- [ ] 执行 `cap sync ios` 成功
- [ ] `apps/mobile/ios` 目录可见且结构完整
- [ ] 可重复执行 `cap sync ios` 且无增量异常

参考命令：

```bash
vp exec cap add ios
vp exec cap sync ios
vp exec cap open ios
```

## C. 打开与运行

- [ ] 执行 `cap open ios` 成功打开 Xcode
- [ ] Scheme 与 Target 配置可编译
- [ ] 至少一个运行目标（模拟器/真机）可以启动
- [ ] App 启动后可加载当前 Web 页面
- [ ] 冷启动与热重启后页面表现一致

## D. 基础验收

- [ ] Web 资源更新后可通过同步流程进入 iOS 工程
- [ ] 基础 Capacitor 桥接调用可用
- [ ] 构建错误可定位到 Xcode 日志
- [ ] 如条件允许，至少一次真机运行验证

## E. 签名与发布占位

- [ ] Bundle Identifier 与团队配置确认
- [ ] Signing & Capabilities 基础项确认
- [ ] Archive 流程可执行
- [ ] TestFlight 分发链路可验证

## 常见排障检查

- [ ] 签名失败时已检查 Team/Profile/Bundle ID 一致性
- [ ] 页面未更新时已检查 build/copy/sync 三步是否都执行
- [ ] 构建失败时已检查 Xcode 版本与依赖状态
