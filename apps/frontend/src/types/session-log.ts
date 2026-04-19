export type SessionLogEntry = {
  id: string
  type:
    | 'sessionOpened'
    | 'sessionClosed'
    | 'messageSent'
    | 'messageReceived'
    | 'messageAck'
    | 'transportError'
  payload: unknown
  timestamp: number
}
