import { storeToRefs } from "pinia";
import { computed, onMounted, ref } from "vue";
import { useLanDiscoveryStore } from "../stores/lan-discovery";
import { useSessionLogs } from "./use-session-logs";
import { useSessionSelection } from "./use-session-selection";

export function useMessagesPage() {
  const store = useLanDiscoveryStore();
  const { connectedSessions, eventLogs, loading, error } = storeToRefs(store);

  const messageInput = ref("");
  const messageType = ref("chat.text");

  const activeSessions = computed(() =>
    connectedSessions.value.filter((item) => item.status === "open"),
  );
  const { selectedSessionId, openSession, syncSelectedSessionFromRoute } =
    useSessionSelection(activeSessions);

  const selectedSession = computed(() =>
    activeSessions.value.find((item) => item.sessionId === selectedSessionId.value),
  );

  const canSend = computed(
    () =>
      Boolean(selectedSession.value?.sessionId) &&
      messageInput.value.trim().length > 0 &&
      !loading.value,
  );

  const { sessionLogs } = useSessionLogs(eventLogs, selectedSessionId);

  async function onSendMessage(): Promise<void> {
    if (!canSend.value || !selectedSession.value) {
      return;
    }

    const content = messageInput.value.trim();
    messageInput.value = "";

    await store.sendMessage({
      sessionId: selectedSession.value.sessionId,
      type: messageType.value,
      payload: content,
    });
  }

  onMounted(async () => {
    await store.ensureListeners();
    syncSelectedSessionFromRoute();
  });

  return {
    activeSessions,
    canSend,
    error,
    loading,
    messageInput,
    messageType,
    onSendMessage,
    openSession,
    selectedSession,
    selectedSessionId,
    sessionLogs,
  };
}
