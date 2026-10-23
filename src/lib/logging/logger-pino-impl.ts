import 'server-only'

import type { LoggerProvider } from '@midnight-ntwrk/midnight-js/types'
import {
  type DestinationStream,
  destination as fileDestination,
  type Level,
  type LoggerOptions,
  levels,
  pino,
  type Logger as Pino,
  stdSerializers,
} from 'pino'
import pretty from 'pino-pretty'

import type { LoggingConfig } from '@/lib/config/logging-config'
import type { LogFields, Logger } from '@/lib/logging/logger'

export class LoggerPinoImpl implements Logger {
  private readonly pino: Pino

  constructor(pinoLogger: Pino) {
    this.pino = pinoLogger
  }

  debug(message: string, fields: LogFields = {}): void {
    this.pino.debug(fields, message)
  }

  info(message: string, fields: LogFields = {}): void {
    this.pino.info(fields, message)
  }

  warn(message: string, fields: LogFields = {}): void {
    this.pino.warn(fields, message)
  }

  error(message: string, fields: LogFields = {}): void {
    this.pino.error(fields, message)
  }

  /** pino applies no formatter to a child's bindings, so their bigints are converted here. */
  child(fields: LogFields): Logger {
    return new LoggerPinoImpl(this.pino.child(bigintsAsStrings(fields)))
  }

  /** The midnight-js SDK's logger slot, which writes the SDK's own objects through the same redaction and format. */
  midnightJsLoggerProvider(): LoggerProvider {
    return this.pino.child({ component: 'midnight-js' })
  }
}

/** The process's root logger, writing to stdout unless a destination is given. */
export function createPinoLogger(
  config: LoggingConfig,
  destination?: DestinationStream,
): LoggerPinoImpl {
  switch (config.format) {
    case 'json':
      return new LoggerPinoImpl(
        pino(cloudLoggingOptions(config), destination ?? fileDestination({ dest: 1, sync: true })),
      )
    case 'pretty':
      return new LoggerPinoImpl(
        pino(
          commonOptions(config),
          pretty({
            messageKey: MESSAGE_KEY,
            translateTime: 'SYS:HH:MM:ss.l',
            sync: true,
            ...(destination === undefined ? {} : { destination }),
          }),
        ),
      )
    default: {
      const unhandled: never = config.format
      throw new Error(`Unhandled log format ${JSON.stringify(unhandled)}`)
    }
  }
}

const MESSAGE_KEY = 'message'

/** Field names that hold a secret wherever an SDK or the console puts them, one level deep. */
const REDACTED_KEYS = ['vaultSecret', 'secret', 'secretKey', 'seed']

function commonOptions(config: LoggingConfig): LoggerOptions {
  return {
    level: config.level,
    messageKey: MESSAGE_KEY,
    errorKey: 'err',
    base: null,
    serializers: { err: stdSerializers.err },
    redact: {
      paths: [...REDACTED_KEYS, ...REDACTED_KEYS.map((key) => `*.${key}`)],
      censor: '[redacted]',
    },
    formatters: { log: bigintsAsStrings },
  }
}

/** Cloud Logging reads `severity`, `message`, `timestamp` and, for Error Reporting, `stack_trace`. */
function cloudLoggingOptions(config: LoggingConfig): LoggerOptions {
  return {
    ...commonOptions(config),
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    formatters: {
      level: (label) => ({ severity: isLevel(label) ? SEVERITY_BY_LEVEL[label] : 'DEFAULT' }),
      log: bigintsAsStrings,
    },
    mixin: (mergeObject, level) =>
      ERROR_REPORTING_LEVELS.includes(levels.labels[level]) &&
      'err' in mergeObject &&
      mergeObject.err instanceof Error
        ? { stack_trace: stdSerializers.err(mergeObject.err).stack }
        : {},
  }
}

const ERROR_REPORTING_LEVELS: readonly (string | undefined)[] = ['error', 'fatal']

const SEVERITY_BY_LEVEL: Readonly<Record<Level, string>> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
}

function isLevel(label: string): label is Level {
  return Object.hasOwn(SEVERITY_BY_LEVEL, label)
}

/** Each top-level bigint as its decimal string, which JSON keeps exactly. */
function bigintsAsStrings(fields: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      typeof value === 'bigint' ? value.toString() : value,
    ]),
  )
}
