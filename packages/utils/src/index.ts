import { createConsola } from 'consola'

type LoggerMethod = (...args: unknown[]) => void

export interface LoggerInstance {
  info: LoggerMethod
  success: LoggerMethod
  warn: LoggerMethod
  error: LoggerMethod
}

const baseLogger = createConsola({
  level: 4
})

const MOBILE_PLATFORMS = new Set(['android', 'ios'])

type RuntimeGlobal = typeof globalThis & {
  window?: unknown
  navigator?: {
    userAgent?: string
  }
  Capacitor?: {
    getPlatform?: () => string
  }
}

function isMobileRuntime(): boolean {
  const runtime = globalThis as RuntimeGlobal
  const platform = runtime.Capacitor?.getPlatform?.()
  if (typeof platform === 'string' && MOBILE_PLATFORMS.has(platform)) {
    return true
  }

  if (typeof runtime.window === 'undefined') {
    return false
  }

  const userAgent = runtime.navigator?.userAgent?.toLowerCase() ?? ''
  return userAgent.includes('android') || userAgent.includes('iphone') || userAgent.includes('ipad')
}

function normalizeUnknown(input: unknown): string {
  if (typeof input === 'string') {
    return input
  }
  if (input instanceof Error) {
    return input.stack ?? `${input.name}: ${input.message}`
  }
  if (
    typeof input === 'number' ||
    typeof input === 'boolean' ||
    typeof input === 'bigint' ||
    typeof input === 'symbol' ||
    typeof input === 'undefined' ||
    input === null
  ) {
    return String(input)
  }

  const visited = new WeakSet<object>()
  try {
    const encoded = JSON.stringify(input, (_key, value: unknown) => {
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack
        }
      }
      if (typeof value === 'bigint') {
        return value.toString()
      }
      if (typeof value === 'object' && value !== null) {
        if (visited.has(value)) {
          return '[Circular]'
        }
        visited.add(value)
      }
      return value
    })
    return encoded ?? Object.prototype.toString.call(input)
  } catch {
    return Object.prototype.toString.call(input)
  }
}

function formatConsoleMessage(fullTag: string, args: unknown[]): string {
  const body = args.map((arg) => normalizeUnknown(arg)).join(' ')
  if (body.length === 0) {
    return `[${fullTag}]`
  }
  return `[${fullTag}] ${body}`
}

/**
 * Create a tagged logger.
 */
export function createLogger(tag: string): LoggerInstance {
  const fullTag = `synra:${tag}`
  if (isMobileRuntime()) {
    return {
      info: (...args) => {
        console.info(formatConsoleMessage(fullTag, args))
      },
      success: (...args) => {
        console.info(formatConsoleMessage(fullTag, args))
      },
      warn: (...args) => {
        console.warn(formatConsoleMessage(fullTag, args))
      },
      error: (...args) => {
        console.error(formatConsoleMessage(fullTag, args))
      }
    }
  }

  const logger = baseLogger.withTag(fullTag)
  return {
    info: logger.info.bind(logger),
    success: logger.success.bind(logger),
    warn: logger.warn.bind(logger),
    error: logger.error.bind(logger)
  }
}
