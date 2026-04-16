# Capacitor Android 实施清单

工作区：`D:/Projects/synra-monorepo`

适用范围：`ai-docs/capacitor-implementation/android`

## 使用说明

- 执行本清单前，先完成上层通用清单。
- 本清单只覆盖 Android 平台特有动作。
- 建议每次执行都记录命令、时间、结果，便于回溯。

## A. 平台准备

- [ ] Android Studio 可正常启动并识别 SDK
- [ ] 本机可用设备（模拟器或真机）已准备
- [ ] `apps/mobile` 已包含有效 Capacitor 配置
- [ ] 本机 JDK/Gradle 与 Android 工程可兼容

## B. 平台创建与同步

- [ ] 执行 `cap add android` 成功
- [ ] 执行 `cap sync android` 成功
- [ ] `apps/mobile/android` 目录可见且结构完整
- [ ] 可重复执行 `cap sync android` 且无增量异常

参考命令：

```bash
vp exec cap add android
vp exec cap sync android
vp exec cap open android
```

## C. 打开与运行

- [ ] 执行 `cap open android` 成功打开 Android Studio
- [ ] Gradle Sync 无阻塞错误
- [ ] 至少一个构建目标可以运行
- [ ] App 启动后可加载当前 Web 页面
- [ ] 冷启动与热重启后页面表现一致

## D. 基础验收

- [ ] Web 资源更新后可通过同步流程进入 Android 工程
- [ ] 基础 Capacitor 桥接调用可用
- [ ] 出错时可定位到构建日志或运行日志
- [ ] 至少一次真机验证（如条件允许）

## E. 发布准备占位

- [ ] Debug 与 Release 构建都可执行
- [ ] 签名配置策略已明确（本地/CI）
- [ ] 最小发布包可产出并安装验证

## 常见排障检查

- [ ] 构建失败时已检查 SDK、JDK、Gradle 版本匹配
- [ ] 页面未更新时已检查 build/copy/sync 三步是否都执行
- [ ] 设备无法安装时已检查 ABI 与最低系统版本设置
