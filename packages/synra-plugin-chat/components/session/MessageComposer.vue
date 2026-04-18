<script setup lang="ts">
const messageInput = defineModel<string>("messageInput", { required: true });
const messageType = defineModel<string>("messageType", { required: true });

defineProps<{
  disabled: boolean;
  canSend: boolean;
}>();

const emit = defineEmits<{
  send: [];
}>();
</script>

<template>
  <PanelCard title="Send Message">
    <div class="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto]">
      <input
        v-model="messageInput"
        class="w-full rounded-md border border-gray-300 px-3 py-2"
        :disabled="disabled"
        placeholder="Type a message..."
        @keyup.enter="emit('send')"
      />
      <input
        v-model="messageType"
        class="rounded-md border border-gray-300 px-3 py-2 md:w-40"
        :disabled="disabled"
        placeholder="message type"
      />
      <button
        class="rounded-md bg-gray-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="!canSend"
        @click="emit('send')"
      >
        Send
      </button>
    </div>
  </PanelCard>
</template>
