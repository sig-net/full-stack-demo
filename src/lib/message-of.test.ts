import { describe, expect, test } from 'vitest'

import { messageOf } from '@/lib/message-of'

const cycle = new Error('outer')
cycle.cause = cycle

const cases: ReadonlyArray<[string, unknown, string]> = [
  ['an error without a cause', new Error('failed'), 'failed'],
  [
    'an error whose cause chain is walked to its end',
    new Error('submit', { cause: new Error('send', { cause: new Error('1010: Invalid') }) }),
    'submit: send: 1010: Invalid',
  ],
  [
    'a cause that is not an error',
    new Error('fetch', { cause: 'ECONNRESET' }),
    'fetch: ECONNRESET',
  ],
  ['a cause that cycles back is walked once', cycle, 'outer'],
  ['a thrown string', 'boom', 'boom'],
  ['a thrown number', 42, '42'],
]

describe('messageOf', () => {
  test.each(cases)('%s', (_name, error, expected) => {
    expect(messageOf(error)).toBe(expected)
  })
})
