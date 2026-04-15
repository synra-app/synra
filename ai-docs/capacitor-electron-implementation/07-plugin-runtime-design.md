# 07 插件运行时设计

## 目标

把 `app.md` 中的插件化设想落为可执行机制：分享内容进入后，自动匹配插件，产出候选动作，并在用户确认后由 PC 端执行。

## 角色划分

- `@synra/plugin-sdk`
  - 提供插件定义接口、匹配结果模型、执行上下文类型。
- `@synra/plugin-runtime`
  - 负责插件注册、匹配排序、冲突处理、执行编排、回执聚合。
- `@synra/capacitor-electron`
  - 提供 PC 端动作适配（打开浏览器、打开文件、调用系统能力）。

## 插件契约（建议）

```ts
export interface SynraPlugin {
  id: string;
  version: string;
  supports(input: ShareInput): Promise<PluginMatchResult>;
  buildActions(input: ShareInput): Promise<PluginAction[]>;
  execute(action: PluginAction, context: ExecuteContext): Promise<PluginExecutionReceipt>;
}
```

## 运行时流程

```mermaid
flowchart LR
  shareInput[ShareInput] --> runtime[PluginRuntime]
  runtime --> supportCheck[SupportsCheck]
  supportCheck --> actionBuild[ActionBuild]
  actionBuild --> decision[DecisionPolicy]
  decision --> execute[ExecuteOnPc]
  execute --> receipt[ExecutionReceipt]
```

## 冲突处理策略

当多个插件匹配同一输入时：

- `first-match`：按优先级选第一个（自动化优先）。
- `user-select`：由用户选择候选动作（可解释性优先）。

建议首版默认 `user-select`，并允许插件配置“高置信度自动执行”。

## 配置模型

每个插件支持独立配置：

- `enabled`：是否启用。
- `requiresConfirm`：是否执行前确认。
- `defaultAction`：默认动作。
- `timeoutMs`：执行超时。

## 示例：Github 打开插件

输入样例：

- `imba97/smserialport`
- `https://github.com/imba97/smserialport`

插件行为：

1. 正则匹配仓库格式或 URL。
2. 标准化为完整 URL。
3. 产出动作 `openInBrowser`。
4. PC 端执行器调用默认浏览器打开。

## 执行保障

- 执行动作必须携带 `actionId` 以支持幂等。
- 执行失败返回结构化错误并标注 `retryable`。
- 所有执行结果都要回传到手机端用于 UI 反馈。

## 安全与隔离

- 插件不得直接访问 Electron 原生对象。
- 所有系统调用通过受控 action adapter 触发。
- 对“打开文件/执行程序”类动作做路径白名单或策略校验。
