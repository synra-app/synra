# Synra 主流程实现文档

整理日期：2026-04-19

该目录承载 Synra 的跨端主流程设计，覆盖手机端触发、跨端传输、PC 端插件执行，以及 `@synra/*` 包体系拆分与实现边界。

当前已明确：MVP 以平台无关底层和 LAN 直连闭环为主，Relay 中继能力后置；PC 作为插件与规则配置的服务端来源。

## 文档范围

- 产品目标与场景来源：`app.md`
- 跨端通讯（MVP：LAN；Relay 后置）
- 插件运行时与执行编排
- 插件 SDK 与插件发布指南
- `@synra/*` 包拆分与依赖边界
- 跨端主流程路线图与执行清单
- 协议与运行时 TypeScript 草案（文档内）
- 契约单页索引（快速对齐）
- Capacitor 设备发现插件（扫描）
- Capacitor 设备连接插件（会话与收发）
- `@synra/hooks` 统一运行时 hooks（连接/会话/消息）

## 阅读顺序

1. `app.md`
2. `cross-device-transport.md`
3. `plugin-runtime-design.md`
4. `plugin-sdk-development.md`
5. `contracts-index.md`
6. `package-splitting.md`
7. `roadmap.md`
8. `checklist.md`
9. `capacitor-lan-discovery-plugin.md`
10. `capacitor-device-connection-plugin.md`
11. `hooks-runtime-migration.md`

## 与 `capacitor-electron-implementation` 的关系

`capacitor-electron-implementation` 仅聚焦 `@synra/capacitor-electron` 的 Electron 宿主桥接实现。  
本目录负责主流程和跨端体系级设计，包含各 `@synra/*` 库的职责与落地顺序。
