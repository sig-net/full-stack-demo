import { describe, expect, test } from 'vitest'

import {
  type LoggingConfig,
  loggingConfigFromEnv,
  loggingEnvSchema,
} from '@/lib/config/logging-config'

const accepted: { name: string; env: Record<string, string>; expected: LoggingConfig }[] = [
  {
    name: 'nothing set logs info as pretty text',
    env: {},
    expected: { level: 'info', format: 'pretty' },
  },
  {
    name: 'production defaults to json',
    env: { NODE_ENV: 'production' },
    expected: { level: 'info', format: 'json' },
  },
  {
    name: 'development defaults to pretty',
    env: { NODE_ENV: 'development' },
    expected: { level: 'info', format: 'pretty' },
  },
  {
    name: 'LOG_FORMAT overrides the production default',
    env: { NODE_ENV: 'production', LOG_FORMAT: 'pretty', LOG_LEVEL: 'debug' },
    expected: { level: 'debug', format: 'pretty' },
  },
  {
    name: 'json can be chosen outside production',
    env: { LOG_FORMAT: 'json', LOG_LEVEL: 'error' },
    expected: { level: 'error', format: 'json' },
  },
]

const rejected: { name: string; env: Record<string, string>; variable: string }[] = [
  { name: 'a level outside the four', env: { LOG_LEVEL: 'trace' }, variable: 'LOG_LEVEL' },
  { name: 'an upper-case level', env: { LOG_LEVEL: 'INFO' }, variable: 'LOG_LEVEL' },
  { name: 'an empty level', env: { LOG_LEVEL: '' }, variable: 'LOG_LEVEL' },
  { name: 'an unknown format', env: { LOG_FORMAT: 'text' }, variable: 'LOG_FORMAT' },
]

describe('loggingConfigFromEnv', () => {
  test.each(accepted)('$name', ({ env, expected }) => {
    expect(loggingConfigFromEnv(loggingEnvSchema.parse(env))).toEqual(expected)
  })
})

describe('loggingEnvSchema', () => {
  test.each(rejected)('rejects $name', ({ env, variable }) => {
    const parsed = loggingEnvSchema.safeParse(env)
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues.map((issue) => issue.path)).toEqual([[variable]])
  })
})
