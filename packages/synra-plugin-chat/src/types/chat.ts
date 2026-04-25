import type { PairedLinkStatus } from '@synra/plugin-sdk/hooks'

export type ChatDeviceListItem = {
  deviceId: string
  name: string
  ipAddress: string
  linkStatus: PairedLinkStatus
  ready: boolean
  isSelected: boolean
  pairedAtLabel: string
}

export type DeliveryState = 'sending' | 'sent' | 'failed' | 'received' | 'system'

export type ChatMessage = {
  id: string
  deviceId?: string
  messageId?: string
  direction: 'incoming' | 'outgoing' | 'system'
  text: string
  timestamp: number
  timeLabel: string
  status: DeliveryState
}
