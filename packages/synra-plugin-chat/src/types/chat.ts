export type ChatSession = {
  sessionId: string
  deviceId?: string
  remote?: string
  direction?: string
  status?: string
  lastActiveAt?: string
}

export type SessionLogEntry = {
  id: string
  timestamp: number
  type: string
  payload: unknown
}
