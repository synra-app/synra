import type { PluginAction, ShareInput, SynraPlugin } from "@synra/plugin-sdk";
import type {
  ProtocolEnvelope,
  ProtocolPayloadByType,
  SynraActionReceipt,
  SynraErrorCode,
  SynraRuntimeMessage,
} from "@synra/protocol";
import type {
  ResolveRuntimeActionsResult,
  RuntimeActionCandidate,
  RuntimeExecuteResult,
} from "../../shared/protocol/types";

export type RuntimeMessageEmitter = (message: SynraRuntimeMessage) => void | Promise<void>;

export type ExecuteSelectedOptions = {
  sessionId: string;
  input: ShareInput;
  action: PluginAction;
  messageId?: string;
  traceId?: string;
  timeoutMs?: number;
  emitMessage?: RuntimeMessageEmitter;
};

export type PluginRuntimeService = {
  register(plugin: SynraPlugin): void;
  unregister(pluginId: string): void;
  listPlugins(): SynraPlugin[];
  resolveActions(input: ShareInput): Promise<ResolveRuntimeActionsResult>;
  executeSelected(options: ExecuteSelectedOptions): Promise<RuntimeExecuteResult>;
};

type PluginRuntimeServiceOptions = {
  now?: () => number;
};

const RUNTIME_PROTOCOL_VERSION = "1.0" as const;

function createMessageId(traceId: string, stage: string): string {
  const randomPart = Math.random().toString(16).slice(2);
  return `${traceId}:${stage}:${randomPart}`;
}

function createRuntimeMessage<TType extends keyof ProtocolPayloadByType>(
  input: Omit<ProtocolEnvelope<TType, ProtocolPayloadByType[TType]>, "protocolVersion">,
): ProtocolEnvelope<TType, ProtocolPayloadByType[TType]> {
  return {
    ...input,
    protocolVersion: RUNTIME_PROTOCOL_VERSION,
  };
}

function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("EXECUTION_TIMEOUT"));
    }, timeoutMs);

    task.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

async function emitRuntimeMessage(
  messages: SynraRuntimeMessage[],
  message: SynraRuntimeMessage,
  emitMessage?: RuntimeMessageEmitter,
): Promise<void> {
  messages.push(message);
  if (emitMessage) {
    await Promise.resolve(emitMessage(message));
  }
}

function toCandidate(
  plugin: SynraPlugin,
  action: PluginAction,
  score: number,
  reason?: string,
): RuntimeActionCandidate {
  return {
    pluginId: plugin.id,
    pluginVersion: plugin.version,
    pluginLabel: plugin.id,
    score,
    reason,
    action,
  };
}

function createFailedReceipt(
  action: PluginAction,
  code: SynraErrorCode,
  message: string,
): SynraActionReceipt {
  return {
    ok: false,
    actionId: action.actionId,
    handledBy: action.pluginId,
    durationMs: 0,
    retryable: code !== "INVALID_PARAMS",
    error: {
      code,
      message,
    },
  };
}

export function createPluginRuntimeService(
  options: PluginRuntimeServiceOptions = {},
): PluginRuntimeService {
  const pluginRegistry = new Map<string, SynraPlugin>();
  const now = options.now ?? (() => Date.now());

  return {
    register(plugin: SynraPlugin): void {
      pluginRegistry.set(plugin.id, plugin);
    },
    unregister(pluginId: string): void {
      pluginRegistry.delete(pluginId);
    },
    listPlugins(): SynraPlugin[] {
      return [...pluginRegistry.values()];
    },
    async resolveActions(input: ShareInput): Promise<ResolveRuntimeActionsResult> {
      const candidates: RuntimeActionCandidate[] = [];

      for (const plugin of pluginRegistry.values()) {
        const match = await plugin.supports(input);
        if (!match.matched) {
          continue;
        }

        const actions = await plugin.buildActions(input);
        for (const action of actions) {
          candidates.push(toCandidate(plugin, action, match.score, match.reason));
        }
      }

      candidates.sort((left, right) => right.score - left.score);
      return { candidates };
    },
    async executeSelected(options: ExecuteSelectedOptions): Promise<RuntimeExecuteResult> {
      const traceId = options.traceId ?? `runtime-${now()}`;
      const requestMessageId = options.messageId ?? createMessageId(traceId, "request");
      const messages: SynraRuntimeMessage[] = [];
      const plugin = pluginRegistry.get(options.action.pluginId);

      const received = createRuntimeMessage({
        messageId: createMessageId(traceId, "received"),
        sessionId: options.sessionId,
        timestamp: now(),
        type: "runtime.received",
        payload: {
          acknowledgedAt: now(),
        },
      });
      await emitRuntimeMessage(messages, received, options.emitMessage);

      if (!plugin) {
        const runtimeError = createRuntimeMessage({
          messageId: createMessageId(traceId, "error"),
          sessionId: options.sessionId,
          timestamp: now(),
          type: "runtime.error",
          payload: {
            code: "PLUGIN_NOT_FOUND",
            message: `Plugin '${options.action.pluginId}' is not registered.`,
            retryable: false,
            details: { requestMessageId },
          },
        });
        await emitRuntimeMessage(messages, runtimeError, options.emitMessage);

        return {
          messages,
          receipt: createFailedReceipt(
            options.action,
            "PLUGIN_NOT_FOUND",
            `Plugin '${options.action.pluginId}' is not registered.`,
          ),
        };
      }

      const started = createRuntimeMessage({
        messageId: createMessageId(traceId, "started"),
        sessionId: options.sessionId,
        timestamp: now(),
        type: "runtime.started",
        payload: {
          startedAt: now(),
        },
      });
      await emitRuntimeMessage(messages, started, options.emitMessage);

      const executeStartAt = now();
      try {
        const receipt = await withTimeout(
          plugin.execute(options.action, {
            deviceId: "pc-host",
            sessionId: options.sessionId,
            traceId,
          }),
          options.timeoutMs ?? 10_000,
        );
        const finished = createRuntimeMessage({
          messageId: createMessageId(traceId, "finished"),
          sessionId: options.sessionId,
          timestamp: now(),
          type: "runtime.finished",
          payload: {
            status: receipt.ok ? "success" : "failed",
            finishedAt: now(),
            result: receipt.ok ? receipt.output : undefined,
            error: receipt.ok
              ? undefined
              : {
                  code: receipt.error.code,
                  message: receipt.error.message,
                  details: receipt.error.details,
                },
          },
        });
        await emitRuntimeMessage(messages, finished, options.emitMessage);

        const normalizedReceipt: SynraActionReceipt = {
          ...receipt,
          durationMs: now() - executeStartAt,
        };

        return {
          messages,
          receipt: normalizedReceipt,
        };
      } catch (error) {
        const isTimeout = error instanceof Error && error.message === "EXECUTION_TIMEOUT";
        const code = isTimeout ? "TIMEOUT" : "RUNTIME_EXECUTION_FAILED";
        const message = isTimeout
          ? "Plugin execution timed out."
          : error instanceof Error
            ? error.message
            : "Plugin execution failed.";

        const finished = createRuntimeMessage({
          messageId: createMessageId(traceId, "finished"),
          sessionId: options.sessionId,
          timestamp: now(),
          type: "runtime.finished",
          payload: {
            status: "failed",
            finishedAt: now(),
            error: {
              code,
              message,
            },
          },
        });
        await emitRuntimeMessage(messages, finished, options.emitMessage);

        return {
          messages,
          receipt: createFailedReceipt(options.action, code, message),
        };
      }
    },
  };
}
