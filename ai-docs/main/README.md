# Synra 主流程实现文档

整理日期：2026-04-15

该目录承载 Synra 的跨端主流程设计，覆盖手机端触发、跨端传输、PC 端插件执行，以及 `@synra/*` 包体系拆分与实现边界。

## 文档范围

- 产品目标与场景来源：`app.md`
- 跨端通讯（LAN 优先、Relay 回落）
- 插件运行时与执行编排
- `@synra/*` 包拆分与依赖边界
- 跨端主流程路线图与执行清单

## 阅读顺序

1. `app.md`
2. `cross-device-transport.md`
3. `plugin-runtime-design.md`
4. `package-splitting.md`
5. `roadmap.md`
6. `checklist.md`

## 与 `capacitor-electron-implementation` 的关系

`capacitor-electron-implementation` 仅聚焦 `@synra/capacitor-electron` 的 Electron 宿主桥接实现。  
本目录负责主流程和跨端体系级设计，包含各 `@synra/*` 库的职责与落地顺序。
