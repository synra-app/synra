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
    sessionId?: string
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
  }
}

export {}
