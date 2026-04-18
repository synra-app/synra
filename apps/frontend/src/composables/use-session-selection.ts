import type { ComputedRef } from "vue";
import type { ConnectedSession } from "../stores/lan-discovery";

function toStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function useSessionSelection(activeSessions: ComputedRef<ConnectedSession[]>) {
  const route = useRoute();
  const router = useRouter();
  const selectedSessionId = ref<string>("");

  function syncSelectedSessionFromRoute(): void {
    const querySessionId = route.query.sessionId;
    const resolved = Array.isArray(querySessionId) ? querySessionId[0] : querySessionId;
    const normalized = toStringValue(resolved);

    if (normalized) {
      selectedSessionId.value = normalized;
      return;
    }

    selectedSessionId.value = activeSessions.value[0]?.sessionId ?? "";
  }

  function openSession(sessionId: string): void {
    selectedSessionId.value = sessionId;
    void router.replace({
      path: route.path,
      query: { sessionId },
    });
  }

  watch(
    () => route.query.sessionId,
    () => {
      syncSelectedSessionFromRoute();
    },
  );

  return {
    openSession,
    selectedSessionId,
    syncSelectedSessionFromRoute,
  };
}
