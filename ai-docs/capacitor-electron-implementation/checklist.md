# Capacitor Electron 实施清单

工作区：`D:/Projects/synra-monorepo`

目标目录：`packages/capacitor-electron`

## 一、初始化与对齐

- [ ] 确认 `packages/capacitor-electron` 已可执行 `vp check` 与 `vp test`
- [ ] 清理模板残留信息（包描述、作者、仓库地址）
- [ ] 确认导出入口策略（仅导出稳定 API）

## 二、结构改造

- [ ] 建立目录：`src/api`、`src/bridge`、`src/host`、`src/shared`
- [ ] 将 `src/index.ts` 改为统一 API 暴露层
- [ ] 在 `src/shared` 落地协议类型与错误码

## 三、协议与桥接

- [ ] 定义 `BridgeRequest` / `BridgeResponse` 类型
- [ ] 定义 channel 白名单（如 `synra:cap-electron:v1:invoke`）
- [ ] preload 仅暴露单一 `invoke` 入口
- [ ] main 侧建立 handler 注册中心
- [ ] 建立 schema 校验（请求前 + 响应后）

## 四、能力实现（最小可用）

- [ ] 实现 `getRuntimeInfo`
- [ ] 实现 `openExternal`
- [ ] 至少实现一个文件能力 API（如 `readFile`）
- [ ] 错误映射统一返回标准错误码

## 五、测试与验收

- [ ] 单测覆盖协议解析、错误码映射、超时逻辑
- [ ] 集成测试覆盖“渲染层 -> preload -> main -> service”主链路
- [ ] 集成测试覆盖“手机触发 -> 跨端传输 -> PC 执行 -> 回执”链路
- [ ] 关键性能基线记录（冷启动、单次 IPC、批量 IPC）
- [ ] 在示例场景中验证 API 可用性与异常行为

## 六、发布准备

- [ ] 检查 `exports` 与类型声明产物一致
- [ ] 文档同步更新（README + 各专题文档）
- [ ] 校验所有包名与示例导入均为 `@synra/*`
- [ ] 发布前执行 `vp check`、`vp test`、`vp pack`
- [ ] 打 tag 前确认协议版本与 breaking change 说明

## 最短落地路径（建议）

1. 先完成 M1：结构 + 协议底座 + 基础单测。
2. 再完成 M2：打通 preload/main/service 主链路。
3. 扩展 M3：按业务优先级增加 API。
4. 扩展 M5：完成 LAN 优先、Relay 回落的跨端通讯。
5. 扩展 M6：完成插件运行时编排与示例插件。
6. 最后做性能调优与发布稳定化。

## 常见问题

### Q1：为什么不直接照搬社区库结构？

因为社区实现长期停更，且上下游版本差异较大。直接迁移会把历史耦合和兼容负担带入新库。

### Q2：为什么强制单一 `invoke` 入口？

为了统一埋点、错误处理、超时控制与安全校验，避免多入口导致行为分裂。

### Q3：为什么要先做协议再做功能？

协议是跨层契约。若先堆功能，后续改协议会导致大量重构与兼容问题。
