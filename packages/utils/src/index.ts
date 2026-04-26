import { createConsola } from 'consola'
import { Capacitor } from '@capacitor/core'

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

function isMobileRuntime(): boolean {
  try {
    const platform = Capacitor.getPlatform()
    return MOBILE_PLATFORMS.has(platform)
  } catch {
    return false
  }
}

function toSerializableValue(input: unknown, visited: WeakSet<object>): unknown {
  if (input instanceof Error) {
    return {
      name: input.name,
      message: input.message,
      stack: input.stack
    }
  }

  if (typeof input === 'bigint') {
    return input.toString()
  }

  if (typeof input === 'symbol' || typeof input === 'function' || typeof input === 'undefined') {
    return String(input)
  }

  if (input === null || typeof input !== 'object') {
    return input
  }

  if (visited.has(input)) {
    return '[Circular]'
  }
  visited.add(input)

  if (Array.isArray(input)) {
    return input.map((item) => toSerializableValue(item, visited))
  }

  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? 'Invalid Date' : input.toISOString()
  }

  const result: Record<string, unknown> = {}
  for (const key of Object.keys(input)) {
    try {
      const value = (input as Record<string, unknown>)[key]
      result[key] = toSerializableValue(value, visited)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result[key] = `[Thrown: ${message}]`
    }
  }
  return result
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

  try {
    const visited = new WeakSet<object>()
    const serializable = toSerializableValue(input, visited)
    const encoded = JSON.stringify(serializable)
    return encoded ?? String(serializable)
  } catch {
    return '[Unserializable]'
  }
}

function formatConsoleMessage(fullTag: string, args: unknown[]): string {
  const body = args.map((arg) => normalizeUnknown(arg)).join(' ')
  if (body.length === 0) {
    return `[${fullTag}]`
  }
  return `[${fullTag}] ${body}`
}

function formatLoggerBody(args: unknown[]): string {
  return args.map((arg) => normalizeUnknown(arg)).join(' ')
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
    info: (...args) => {
      logger.info(formatLoggerBody(args))
    },
    success: (...args) => {
      logger.success(formatLoggerBody(args))
    },
    warn: (...args) => {
      logger.warn(formatLoggerBody(args))
    },
    error: (...args) => {
      logger.error(formatLoggerBody(args))
    }
  }
}
