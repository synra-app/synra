# Capacitor Electron 实施清单

工作区：`D:/Projects/synra-monorepo`

目标目录：`packages/capacitor-electron`

## 使用说明

- 本清单按 `01 -> 02 -> 03 -> 04` 顺序执行。
- 每一项都应能映射到对应文档章节，直接服务从零实现。
- 勾选标准：有代码、有测试、有文档证据。

## A. 架构与边界（对应 01）

- [ ] 建立分层目录：`src/api`、`src/bridge`、`src/host`、`src/shared`
- [ ] 落地单一 invoke 主通道，禁止旁路入口
- [ ] 明确依赖方向（仅上层依赖下层 + `shared`）
- [ ] Preload 仅暴露最小 API，不暴露原生 Electron 对象
- [ ] Main 端实现 handler 注册中心与幂等注册保护
- [ ] 生命周期覆盖初始化、运行、退出三阶段清理

## B. API 与协议（对应 02）

- [ ] 定义 `BridgeRequest` / `BridgeResponse` 并完成 schema 校验
- [ ] 定义稳定错误码（`INVALID_PARAMS`、`TIMEOUT` 等）并统一映射
- [ ] 固定 channel 白名单（示例：`synra:cap-electron:v1:invoke`）
- [ ] 方法名采用白名单注册，不允许动态透传
- [ ] 完成协议版本协商与不兼容返回结构
- [ ] `getRuntimeInfo` 返回兼容矩阵所需字段
- [ ] 超时与取消机制可用且可测试

## C. 工程化与性能（对应 03）

- [ ] 定义并发布兼容矩阵（OS/Electron/Capacitor/Node）
- [ ] 建立性能预算并有可复现测量方法
- [ ] 结构化日志字段齐全（requestId/method/duration/status/errorCode）
- [ ] 新增 API 同步更新类型、schema、文档、测试
- [ ] 升级策略可执行（Electron/Capacitor 升级回归流程）
- [ ] CI 至少包含 `vp check` 与 `vp test`

## D. 里程碑交付（对应 04）

### M1：MVP 基础层

- [ ] 工程骨架与协议底座完成
- [ ] 最小 mock API 可调用
- [ ] 通过 `vp check` 与 `vp test`

### M2：MVP 主链路

- [ ] 打通 `renderer -> preload -> main -> service`
- [ ] 最小能力集可用（runtime/external/file）
- [ ] 安全基线验证通过（白名单 + 输入校验）

### M3：开源 Beta

- [ ] 稳定 API 子集和兼容矩阵验证通过
- [ ] 最小示例可跑通核心流程
- [ ] 文档可支持外部开发者独立接入

### M4：1.0 发布

- [ ] 性能指标达到 `04` 预算基线
- [ ] 发布流程跑通（`vp check`、`vp test`、`vp pack`）
- [ ] 迁移说明与 breaking change 说明完整

## E. 最终发布前核对

- [ ] `exports` 与类型产物一致，入口清晰
- [ ] 文档与实现一致（README/01/02/03/04/checklist）
- [ ] 兼容矩阵、测试矩阵、版本策略已对外可见
- [ ] 安全默认配置与限制项有明确说明
- [ ] 发布说明包含升级路径和已知限制

## 最短路径（从零实现）

1. 先完成 A + B（边界与契约先收敛）。
2. 再完成 M1 + M2（主链路可用）。
3. 然后完成 C + M3（工程化与开源 Beta）。
4. 最后完成 M4 + E（1.0 发布）。

## 常见问题

### Q1：为什么不直接照搬社区库结构？

社区实现可用于参考，但版本和历史约束不同。当前方案以“契约与边界先行”的方式重建，降低未来维护成本。

### Q2：为什么强制单一 `invoke` 入口？

单入口有助于统一安全校验、超时控制、错误映射与可观测性，避免行为分裂。

### Q3：为什么先做协议与矩阵再做扩展？

协议和兼容矩阵是开源协作的共同语言。先收敛契约，才能避免后续大规模破坏性重构。
