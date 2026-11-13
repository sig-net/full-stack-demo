import { z } from 'zod'

import { LOG_LEVELS, type LogLevel } from '@/lib/logging/logger'

/** How the server writes its log lines. */
export interface LoggingConfig {
  /** The least severe level written. */
  readonly level: LogLevel
  readonly format: LogFormat
}

/** `json` writes one Cloud Logging shaped object per line, `pretty` writes coloured text for a terminal. */
export const LOG_FORMATS = ['pretty', 'json'] as const

export type LogFormat = (typeof LOG_FORMATS)[number]

export const loggingEnvSchema = z.object({
  LOG_LEVEL: z.enum(LOG_LEVELS).optional(),
  LOG_FORMAT: z.enum(LOG_FORMATS).optional(),
  NODE_ENV: z.string().optional(),
})

export type LoggingEnv = z.infer<typeof loggingEnvSchema>

export function loggingConfigFromEnv(env: LoggingEnv): LoggingConfig {
  return {
    level: env.LOG_LEVEL ?? 'info',
    format: env.LOG_FORMAT ?? (env.NODE_ENV === 'production' ? 'json' : 'pretty'),
  }
}
