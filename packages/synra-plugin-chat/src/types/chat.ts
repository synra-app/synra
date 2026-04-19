export type ChatSession = {
  sessionId: string
  deviceId?: string
  host?: string
  port?: number
  remote?: string
  direction?: string
  status?: string
  openedAt?: number
  closedAt?: number
  lastActiveAt?: string
}

export type SessionLogEntry = {
  id: string
  timestamp: number
  type: string
  payload: unknown
}

export type ChatDevice = {
  deviceId: string
  name: string
  ipAddress?: string
  source?: string
  connectable: boolean
  connectCheckError?: string
  lastSeenAt?: number
  lastSeenLabel: string
  sessionId?: string
  sessionStatus?: string
  isSelected: boolean
}

export type DeliveryState = 'sending' | 'sent' | 'acked' | 'failed' | 'received' | 'system'

export type ChatMessage = {
  id: string
  sessionId?: string
  messageId?: string
  direction: 'incoming' | 'outgoing' | 'system'
  text: string
  messageType?: string
  timestamp: number
  timeLabel: string
  status: DeliveryState
}
