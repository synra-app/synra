export type ChatDevice = {
  deviceId: string
  name: string
  ipAddress?: string
  source?: string
  connectable: boolean
  lastSeenAt?: number
  lastSeenLabel: string
  connectionStatus?: 'connected' | 'idle'
  isSelected: boolean
}

export type DeliveryState = 'sending' | 'sent' | 'failed' | 'received' | 'system'

export type ChatMessage = {
  id: string
  deviceId?: string
  messageId?: string
  direction: 'incoming' | 'outgoing' | 'system'
  text: string
  messageType?: string
  timestamp: number
  timeLabel: string
  status: DeliveryState
}
