import { createLogger } from '@synra/utils'

const loggerBundle = {
  tcpLogger: createLogger('tcp')
}

export function useLogger() {
  return loggerBundle
}
