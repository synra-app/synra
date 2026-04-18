import type { SynraPlugin, ShareInput, PluginAction } from "@synra/plugin-sdk";
import type { SynraActionReceipt, SynraErrorCode } from "@synra/protocol";
import type { ExternalLinkService } from "../services/external-link.service";

const PLUGIN_ID = "github-open";
const OWNER_REPO_PATTERN = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i;

function normalizeGitHubUrl(input: ShareInput): string | null {
  const raw = input.raw.trim();
  if (raw.length === 0) {
    return null;
  }

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const url = new URL(raw);
      if (url.hostname === "github.com" || url.hostname.endsWith(".github.com")) {
        return url.toString();
      }
    } catch {
      return null;
    }
  }

  if (OWNER_REPO_PATTERN.test(raw)) {
    return `https://github.com/${raw}`;
  }

  return null;
}

function createSuccessReceipt(
  action: PluginAction,
  output: unknown,
  durationMs: number,
): SynraActionReceipt {
  return {
    ok: true,
    actionId: action.actionId,
    handledBy: PLUGIN_ID,
    durationMs,
    output,
  };
}

function createFailureReceipt(
  action: PluginAction,
  code: SynraErrorCode,
  message: string,
  durationMs: number,
): SynraActionReceipt {
  return {
    ok: false,
    actionId: action.actionId,
    handledBy: PLUGIN_ID,
    durationMs,
    retryable: code !== "INVALID_PARAMS",
    error: {
      code,
      message,
    },
  };
}

export function createGitHubOpenPlugin(externalLinkService: ExternalLinkService): SynraPlugin {
  const plugin: SynraPlugin & {
    meta: {
      packageName: string;
      displayName: string;
      builtin: boolean;
      defaultPage: string;
      icon: string;
    };
  } = {
    id: PLUGIN_ID,
    version: "0.1.0",
    meta: {
      packageName: "synra-plugin-github-open",
      displayName: "GitHub Open",
      builtin: true,
      defaultPage: "home",
      icon: "i-lucide-github",
    },
    async supports(input: ShareInput) {
      const url = normalizeGitHubUrl(input);
      return {
        matched: Boolean(url),
        score: url ? 90 : 0,
        reason: url ? "Detected GitHub URL or owner/repo reference." : "Not a GitHub target.",
      };
    },
    async buildActions(input: ShareInput) {
      const url = normalizeGitHubUrl(input);
      if (!url) {
        return [];
      }

      return [
        {
          actionId: `${PLUGIN_ID}:open`,
          pluginId: PLUGIN_ID,
          actionType: "external.open-url",
          label: "Open in browser",
          requiresConfirm: true,
          payload: { url },
        },
      ];
    },
    async execute(action: PluginAction) {
      const startedAt = Date.now();
      const payload = action.payload;
      const url =
        payload &&
        typeof payload === "object" &&
        "url" in payload &&
        typeof payload.url === "string"
          ? payload.url
          : null;

      if (!url) {
        return createFailureReceipt(
          action,
          "INVALID_PARAMS",
          "Missing URL in action payload.",
          Date.now() - startedAt,
        );
      }

      try {
        await externalLinkService.openExternal(url);
        return createSuccessReceipt(action, { url }, Date.now() - startedAt);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to open GitHub URL.";
        return createFailureReceipt(
          action,
          "RUNTIME_EXECUTION_FAILED",
          message,
          Date.now() - startedAt,
        );
      }
    },
  };

  return plugin;
}
