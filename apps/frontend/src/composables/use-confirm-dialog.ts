import { computed, ref } from 'vue'

export function useConfirmDialog() {
  const dialogOpen = ref(false)
  const dialogMessage = ref('')
  const dialogResolver = ref<((confirmed: boolean) => void) | null>(null)

  const isDialogOpen = computed(() => dialogOpen.value)

  function askConfirmation(message: string): Promise<boolean> {
    dialogMessage.value = message
    dialogOpen.value = true
    return new Promise<boolean>((resolve) => {
      dialogResolver.value = resolve
    })
  }

  function resolveDialog(confirmed: boolean): void {
    const resolve = dialogResolver.value
    dialogResolver.value = null
    dialogOpen.value = false
    dialogMessage.value = ''
    resolve?.(confirmed)
  }

  return {
    dialogMessage,
    isDialogOpen,
    askConfirmation,
    resolveDialog
  }
}
