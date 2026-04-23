declare global {
  type SynraHostEvent = {
    id: number
    timestamp: number
    type:
      | 'transport.session.opened'
      | 'transport.session.closed'
      | 'transport.message.received'
      | 'transport.message.ack'
      | 'transport.error'
    remote: string
    deviceId?: string
    messageId?: string
    messageType?: string
    code?: string
    payload?: unknown
  }

  interface Window {
    __synraCapElectron?: {
      invoke: (
        method: string,
        payload: Record<string, unknown>,
        options?: { timeoutMs?: number }
      ) => Promise<unknown>
      onHostEvent?: (listener: (event: SynraHostEvent) => void) => () => void
    }
    __synraWindowControls?: {
      /** Node/Electron `process.platform` (e.g. `darwin`, `win32`, `linux`). */
      platform?: string
      minimize: () => Promise<void>
      toggleMaximize: () => Promise<boolean>
      close: () => Promise<void>
      isMaximized: () => Promise<boolean>
      onWindowStateChange: (
        listener: (state: { maximized: boolean; focused: boolean }) => void
      ) => () => void
    }
  }
}

export {}
