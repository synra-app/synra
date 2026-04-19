import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppShellStore = defineStore('app-shell', () => {
  const isSidebarCollapsed = ref(false)
  const isMobileMenuOpen = ref(false)

  function toggleSidebar(): void {
    isSidebarCollapsed.value = !isSidebarCollapsed.value
  }

  function toggleMobileMenu(): void {
    isMobileMenuOpen.value = !isMobileMenuOpen.value
  }

  function closeMobileMenu(): void {
    isMobileMenuOpen.value = false
  }

  return {
    isSidebarCollapsed,
    isMobileMenuOpen,
    toggleSidebar,
    toggleMobileMenu,
    closeMobileMenu
  }
})
