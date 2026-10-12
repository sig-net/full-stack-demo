import { describe, expect, test, vi } from 'vitest'

import { runUntilAborted } from '@/lib/run-until-aborted'

interface Case {
  name: string
  /** What each run does, in order: end, throw, or abort the loop from inside. */
  runs: ('end' | 'throw' | 'abort')[]
  expectRuns: number
  expectLogged: number
}

const cases: Case[] = [
  {
    name: 'a run that ends is started again after the delay, until an abort from inside',
    runs: ['end', 'end', 'abort'],
    expectRuns: 3,
    expectLogged: 0,
  },
  {
    name: 'a run that fails is logged and started again',
    runs: ['throw', 'abort'],
    expectRuns: 2,
    expectLogged: 1,
  },
  {
    name: 'a failure after the abort is not logged',
    runs: ['abort'],
    expectRuns: 1,
    expectLogged: 0,
  },
]

describe('runUntilAborted', () => {
  test.each(cases)('$name', async ({ runs, expectRuns, expectLogged }) => {
    const controller = new AbortController()
    const scripted = [...runs]
    let ran = 0
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      await runUntilAborted(
        'The loop',
        async () => {
          ran += 1
          const step = scripted.shift()
          if (step === undefined) throw new Error('the work ran more often than the test scripted')
          if (step === 'abort') {
            controller.abort()
            throw new Error('ended by the abort')
          }
          if (step === 'throw') throw new Error('broke')
        },
        controller.signal,
        1,
      )
      expect(ran).toBe(expectRuns)
      expect(logged).toHaveBeenCalledTimes(expectLogged)
    } finally {
      logged.mockRestore()
    }
  })

  test('an abort during the delay ends the loop without waiting it out', async () => {
    const controller = new AbortController()
    let ran = 0
    const looping = runUntilAborted(
      'The loop',
      async () => {
        ran += 1
      },
      controller.signal,
      60_000,
    )
    await vi.waitFor(() => {
      expect(ran).toBe(1)
    })
    controller.abort()
    await looping
    expect(ran).toBe(1)
  })

  test('an aborted signal runs nothing', async () => {
    const controller = new AbortController()
    controller.abort()
    let ran = 0
    await runUntilAborted(
      'The loop',
      async () => {
        ran += 1
      },
      controller.signal,
      1,
    )
    expect(ran).toBe(0)
  })
})
