# Capacitor 通用实施清单

工作区：`D:/Projects/synra-monorepo`

适用范围：`ai-docs/capacitor-implementation` 通用阶段

## 使用说明

- 该清单只覆盖平台无关步骤，先于 Android/iOS 清单执行。
- Android / iOS 特有步骤请进入各自子目录执行。
- 勾选标准：有命令执行证据、有目录/产物证据、有运行结果证据。

## A. 工程初始化

- [ ] 确认目录职责：`apps/frontend` 负责 Web 构建，`apps/mobile` 负责 Capacitor 容器
- [ ] 在 `apps/mobile` 安装 Capacitor 依赖（`core/android/ios/cli`）
- [ ] 使用 Capacitor CLI 初始化 mobile 工程
- [ ] 固定 App ID 与 App Name 规范
- [ ] 形成可复述的初始化命令记录（供新人复用）

参考命令：

```bash
vp add --filter mobile @capacitor/core @capacitor/android @capacitor/ios
vp add --filter mobile -D @capacitor/cli
vp exec --filter mobile cap init
```

## B. Web 产物接入

- [ ] Capacitor 配置中 `webDir` 固定为 `www`
- [ ] 可执行 `frontend build` 产出 `apps/frontend/dist`
- [ ] 建立 `dist -> www` 同步步骤
- [ ] 同步后 `apps/mobile/www/index.html` 可见
- [ ] 确认 `www` 可被重复覆盖且不会残留旧资源

## C. 同步与校验

- [ ] 执行 `cap sync` 成功
- [ ] 原生平台目录与配置未被异常覆盖
- [ ] 基础页面可被原生容器加载
- [ ] 至少完成一次“改动前端页面 -> 重新构建 -> 同步 -> 原生验证”闭环

## D. 交接到平台文档

- [ ] Android 进入 `android/README.md` 与 `android/checklist.md`
- [ ] iOS 进入 `ios/README.md` 与 `ios/checklist.md`

## E. 通用排障检查

- [ ] `cap sync` 失败时已检查当前目录是否位于 `apps/mobile`
- [ ] `www` 页面异常时已检查产物是否来自最新 `frontend` 构建
- [ ] 平台工程缺文件时已重新执行平台级 `cap sync`
- [ ] 关键操作有最小日志记录（命令、时间、结果）

## 交付物清单

- [ ] 通用流程文档已对齐当前仓库结构
- [ ] 新成员可按清单独立跑通通用链路
