<script setup lang="ts">
const {
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
} = useMessagesPage();
</script>

<template>
  <section class="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
    <div class="space-y-4 lg:col-span-4">
      <PanelCard title="Chat">
        <p><strong>Active session:</strong> {{ selectedSessionId || "-" }}</p>
        <p><strong>Status:</strong> {{ selectedSession?.status ?? "idle" }}</p>
        <p><strong>Remote:</strong> {{ selectedSession?.remote ?? "-" }}</p>
        <p><strong>Direction:</strong> {{ selectedSession?.direction ?? "-" }}</p>
        <p v-if="error" class="text-error-7">{{ error }}</p>
      </PanelCard>

      <SessionList
        :sessions="activeSessions"
        :selected-session-id="selectedSessionId"
        mode="messages"
        @select="openSession"
        @open-messages="openSession"
      />
    </div>

    <div class="space-y-4 lg:col-span-8">
      <MessageComposer
        v-model:message-input="messageInput"
        v-model:message-type="messageType"
        :disabled="!selectedSession || loading"
        :can-send="canSend"
        @send="onSendMessage"
      />
      <SessionEventLog :entries="sessionLogs" />
    </div>
  </section>
</template>
