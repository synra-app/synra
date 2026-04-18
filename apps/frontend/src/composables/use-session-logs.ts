import { computed, type Ref } from "vue";
import type { SessionLogEntry } from "../types/session-log";

function toStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getPayloadSessionId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const candidate = payload as { sessionId?: unknown };
  return toStringValue(candidate.sessionId);
}

export function useSessionLogs(eventLogs: Ref<SessionLogEntry[]>, selectedSessionId: Ref<string>) {
  const sessionLogs = computed<SessionLogEntry[]>(() => {
    if (!selectedSessionId.value) {
      return [];
    }

    return eventLogs.value.filter(
      (entry) => getPayloadSessionId(entry.payload) === selectedSessionId.value,
    );
  });

  return {
    sessionLogs,
  };
}
