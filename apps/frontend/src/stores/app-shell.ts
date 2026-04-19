import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppShellStore = defineStore('app-shell', () => {
  const isMobileMenuOpen = ref(false)

  function toggleMobileMenu(): void {
    isMobileMenuOpen.value = !isMobileMenuOpen.value
  }

  function closeMobileMenu(): void {
    isMobileMenuOpen.value = false
  }

  return {
    isMobileMenuOpen,
    toggleMobileMenu,
    closeMobileMenu
  }
})
