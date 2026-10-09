import { describe, expect, test, vi } from 'vitest'

import { sweep, type SweepTask } from '@/lib/sweep'

/** A sweep over two tasks that record their runs, ended by the abort the case scripts. */
interface Case {
  name: string
  intervalMs: number
  /** What the first task does on each run, in order: record, throw, or abort the sweep. */
  first: ('run' | 'throw' | 'abort')[]
  /** What the second task does on each run, in order. */
  second: ('run' | 'abort')[]
  /** Aborts from outside the tasks, after the first pass has ended, when set. */
  abortAfterFirstPass?: boolean
  expectRuns: string[]
  expectLogged: number
}

const cases: Case[] = [
  {
    name: 'a failing task is logged and the next task still runs, and the pass repeats after the interval',
    intervalMs: 1,
    first: ['throw', 'run', 'abort'],
    second: ['run', 'run'],
    expectRuns: ['first', 'second', 'first', 'second', 'first'],
    expectLogged: 1,
  },
  {
    name: 'an abort during a pass ends the pass after the task that is running',
    intervalMs: 1,
    first: ['abort'],
    second: [],
    expectRuns: ['first'],
    expectLogged: 0,
  },
  {
    name: 'an abort during the interval ends the sweep without waiting the interval out',
    intervalMs: 60_000,
    first: ['run'],
    second: ['run'],
    abortAfterFirstPass: true,
    expectRuns: ['first', 'second'],
    expectLogged: 0,
  },
  {
    name: 'an abort from the second task ends the pass without a further first run',
    intervalMs: 1,
    first: ['run'],
    second: ['abort'],
    expectRuns: ['first', 'second'],
    expectLogged: 0,
  },
]

describe('sweep', () => {
  test.each(cases)(
    '$name',
    async ({ intervalMs, first, second, abortAfterFirstPass, expectRuns, expectLogged }) => {
      const controller = new AbortController()
      const runs: string[] = []
      const scripted = (name: string, script: ('run' | 'throw' | 'abort')[]): SweepTask => ({
        name,
        run: async () => {
          runs.push(name)
          const step = script.shift()
          if (step === undefined) throw new Error(`${name} ran more often than the test scripted`)
          if (step === 'throw') throw new Error(`${name} broke`)
          if (step === 'abort') controller.abort()
        },
      })
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const announced = vi.spyOn(console, 'log').mockImplementation(() => undefined)
      try {
        const sweeping = sweep(
          [scripted('first', [...first]), scripted('second', [...second])],
          intervalMs,
          controller.signal,
        )
        if (abortAfterFirstPass) {
          await vi.waitFor(() => {
            expect(runs).toEqual(expectRuns)
          })
          controller.abort()
        }
        await sweeping
        expect(runs).toEqual(expectRuns)
        expect(logged).toHaveBeenCalledTimes(expectLogged)
      } finally {
        logged.mockRestore()
        announced.mockRestore()
      }
    },
  )

  test('an aborted signal runs nothing', async () => {
    const controller = new AbortController()
    controller.abort()
    let ran = 0
    await sweep(
      [
        {
          name: 'task',
          run: async () => {
            ran += 1
          },
        },
      ],
      1,
      controller.signal,
    )
    expect(ran).toBe(0)
  })
})
