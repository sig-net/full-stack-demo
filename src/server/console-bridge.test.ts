import { afterEach, describe, expect, test } from 'vitest'

import { RecordingLogger } from '@/lib/testing/recording-logger'
import { bridgeConsole } from '@/server/console-bridge'

const original = {
  debug: console.debug,
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
}

afterEach(() => {
  Object.assign(console, original)
})

describe('bridgeConsole', () => {
  test('each console call becomes one line at its level, formatted, with the first Error as err', () => {
    const logger = new RecordingLogger()
    bridgeConsole(logger)
    bridgeConsole(new RecordingLogger())
    const failure = new Error('socket closed')
    console.debug('compiled %s in %d ms', '/page', 12)
    console.log('ready')
    console.info({ port: 3100 })
    console.warn('retrying', failure, new Error('second'))
    console.error(failure)
    expect(logger.lines.map(({ level, message }) => [level, message])).toEqual([
      ['debug', 'compiled /page in 12 ms'],
      ['info', 'ready'],
      ['info', '{ port: 3100 }'],
      ['warn', expect.stringContaining('retrying Error: socket closed')],
      ['error', expect.stringContaining('Error: socket closed')],
    ])
    expect(logger.lines.map((line) => line.fields.err)).toEqual([
      undefined,
      undefined,
      undefined,
      failure,
      failure,
    ])
  })
})
