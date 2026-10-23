import 'server-only'

import { format } from 'node:util'

import type { Logger, LogLevel } from '@/lib/logging/logger'

/**
 * Routes the console output of code the application does not own (Next.js, the SDKs) through
 * `logger`, one line per call: the arguments formatted as the console formats them, and the
 * first Error among them as `err`. A second call changes nothing.
 */
export function bridgeConsole(logger: Logger): void {
  if (bridged) return
  bridged = true
  for (const method of CONSOLE_METHODS) {
    const level = LEVEL_BY_CONSOLE_METHOD[method]
    console[method] = (...args: unknown[]): void => {
      const err = args.find((arg): arg is Error => arg instanceof Error)
      logger[level](format(...args), err === undefined ? {} : { err })
    }
  }
}

let bridged = false

const CONSOLE_METHODS = ['debug', 'log', 'info', 'warn', 'error'] as const

const LEVEL_BY_CONSOLE_METHOD: Readonly<Record<(typeof CONSOLE_METHODS)[number], LogLevel>> = {
  debug: 'debug',
  log: 'info',
  info: 'info',
  warn: 'warn',
  error: 'error',
}
