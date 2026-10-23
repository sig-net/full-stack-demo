import { Writable } from 'node:stream'

import { describe, expect, test } from 'vitest'

import type { LoggingConfig } from '@/lib/config/logging-config'
import { createPinoLogger, type LoggerPinoImpl } from '@/lib/logging/logger-pino-impl'

interface Case {
  name: string
  config: LoggingConfig
  write: (logger: LoggerPinoImpl) => void
  check: (lines: unknown[]) => void
}

const JSON_INFO: LoggingConfig = { level: 'info', format: 'json' }

const cases: Case[] = [
  {
    name: 'a json line is Cloud Logging shaped, its message under message and its level as severity',
    config: JSON_INFO,
    write: (logger) => {
      logger.info('transition applied', { resource: 'callers/a/deposits/b', toState: 'Completed' })
    },
    check: (lines) => {
      expect(lines).toHaveLength(1)
      expect(lines[0]).toEqual({
        severity: 'INFO',
        timestamp: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/),
        message: 'transition applied',
        resource: 'callers/a/deposits/b',
        toState: 'Completed',
      })
    },
  },
  {
    name: 'each level maps to its Cloud Logging severity',
    config: { level: 'debug', format: 'json' },
    write: (logger) => {
      logger.debug('one')
      logger.info('two')
      logger.warn('three')
      logger.error('four')
    },
    check: (lines) => {
      expect(lines).toMatchObject([
        { severity: 'DEBUG', message: 'one' },
        { severity: 'INFO', message: 'two' },
        { severity: 'WARNING', message: 'three' },
        { severity: 'ERROR', message: 'four' },
      ])
    },
  },
  {
    name: 'lines below the configured level are not written',
    config: { level: 'warn', format: 'json' },
    write: (logger) => {
      logger.debug('hidden')
      logger.info('hidden')
      logger.warn('shown')
    },
    check: (lines) => {
      expect(lines).toMatchObject([{ message: 'shown' }])
    },
  },
  {
    name: 'a bigint field is written as its decimal string, in a line and in a child binding',
    config: JSON_INFO,
    write: (logger) => {
      logger.child({ lastSeen: 12345678901234567890n }).info('read', { offset: 7n })
    },
    check: (lines) => {
      expect(lines).toMatchObject([{ lastSeen: '12345678901234567890', offset: '7' }])
    },
  },
  {
    name: 'an error line carries the error with its cause chain and a stack_trace',
    config: JSON_INFO,
    write: (logger) => {
      logger.error('flush failed', {
        err: new Error('the flush failed', { cause: new Error('the node refused it') }),
      })
    },
    check: (lines) => {
      expect(lines).toMatchObject([
        {
          severity: 'ERROR',
          message: 'flush failed',
          err: {
            type: 'Error',
            message: 'the flush failed: the node refused it',
            stack: expect.stringContaining('caused by: Error: the node refused it'),
          },
          stack_trace: expect.stringContaining('Error: the flush failed'),
        },
      ])
    },
  },
  {
    name: 'a warning with an error carries the error and no stack_trace',
    config: JSON_INFO,
    write: (logger) => {
      logger.warn('refresh failed', { err: new Error('timed out') })
    },
    check: (lines) => {
      expect(lines).toMatchObject([{ err: { message: 'timed out' } }])
      expect(lines[0]).not.toHaveProperty('stack_trace')
    },
  },
  {
    name: 'a child merges its bindings into every line, and a line field overrides a binding',
    config: JSON_INFO,
    write: (logger) => {
      const child = logger.child({ component: 'Sweep', task: 'deposits' })
      child.info('pass ended', { count: 2 })
      child.child({ task: 'flush' }).info('pass ended')
    },
    check: (lines) => {
      expect(lines).toMatchObject([
        { component: 'Sweep', task: 'deposits', count: 2 },
        { component: 'Sweep', task: 'flush' },
      ])
    },
  },
  {
    name: 'the SDK provider tags its lines midnight-js and redacts secret-named fields one level deep',
    config: JSON_INFO,
    write: (logger) => {
      logger
        .midnightJsLoggerProvider()
        .info?.(
          { seed: 'aa', secretKey: 'bb', wallet: { secret: 'cc', vaultSecret: 'dd', id: 1 } },
          'wallet built',
        )
    },
    check: (lines) => {
      expect(lines).toEqual([
        expect.objectContaining({
          component: 'midnight-js',
          message: 'wallet built',
          seed: '[redacted]',
          secretKey: '[redacted]',
          wallet: { secret: '[redacted]', vaultSecret: '[redacted]', id: 1 },
        }),
      ])
    },
  },
  {
    name: 'an SDK fatal line is CRITICAL and carries a stack_trace',
    config: JSON_INFO,
    write: (logger) => {
      logger.midnightJsLoggerProvider().fatal?.({ err: new Error('wallet lost') }, 'sync ended')
    },
    check: (lines) => {
      expect(lines).toMatchObject([
        {
          severity: 'CRITICAL',
          message: 'sync ended',
          stack_trace: expect.stringContaining('Error: wallet lost'),
        },
      ])
    },
  },
]

describe('createPinoLogger', () => {
  test.each(cases)('$name', ({ config, write, check }) => {
    const written: string[] = []
    write(createPinoLogger(config, { write: (line) => written.push(line) }))
    check(written.map((line): unknown => JSON.parse(line)))
  })

  test('pretty writes one text line per call, with the message and its fields', async () => {
    const chunks: string[] = []
    const destination = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk.toString())
        callback()
      },
    })
    createPinoLogger({ level: 'info', format: 'pretty' }, destination).info('event received', {
      event: 'deposit.awaiting-start-transaction',
    })
    await expect.poll(() => chunks.join('')).toContain('event received')
    const text = chunks.join('')
    expect(text).toContain('deposit.awaiting-start-transaction')
    expect(() => JSON.parse(text) as unknown).toThrow()
  })
})
