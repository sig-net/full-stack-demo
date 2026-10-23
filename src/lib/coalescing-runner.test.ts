import { describe, expect, test } from 'vitest'

import { CoalescingRunner } from '@/lib/coalescing-runner'

interface Case {
  name: string
  /** What each run of the work answers, in order: whether to run again, or the error it throws. */
  answers: (boolean | Error)[]
  expectRuns: number
  expectError?: string
}

const cases: Case[] = [
  { name: 'work that asks for no more runs runs once', answers: [false], expectRuns: 1 },
  {
    name: 'work runs again while it asks to',
    answers: [true, true, false],
    expectRuns: 3,
  },
  {
    name: 'a failure ends the runs and rejects the call',
    answers: [true, new Error('broke')],
    expectRuns: 2,
    expectError: 'broke',
  },
]

describe('CoalescingRunner', () => {
  test.each(cases)('$name', async ({ answers, expectRuns, expectError }) => {
    const scripted = [...answers]
    let ran = 0
    const runner = new CoalescingRunner(async () => {
      ran += 1
      const answer = scripted.shift()
      if (answer === undefined) throw new Error('the work ran more often than the test scripted')
      if (answer instanceof Error) throw answer
      return answer
    })
    const running = runner.run()
    if (expectError === undefined) await running
    else await expect(running).rejects.toThrow(expectError)
    expect(ran).toBe(expectRuns)
  })

  test('a call during a run shares the promise and makes the work go once more', async () => {
    const firstRun = gate()
    let ran = 0
    const runner = new CoalescingRunner(async () => {
      ran += 1
      if (ran === 1) await firstRun.opened
      return false
    })
    const first = runner.run()
    const second = runner.run()
    expect(second).toBe(first)
    expect(ran).toBe(1)
    firstRun.open()
    await first
    expect(ran).toBe(2)

    await runner.run()
    expect(ran).toBe(3)
  })

  test('the next call after a failure starts a new run', async () => {
    let ran = 0
    const runner = new CoalescingRunner(async () => {
      ran += 1
      throw new Error('broke')
    })
    await expect(runner.run()).rejects.toThrow('broke')
    await expect(runner.run()).rejects.toThrow('broke')
    expect(ran).toBe(2)
  })
})

/** A promise the test opens by hand, so a run can be held mid-flight. */
function gate(): { opened: Promise<void>; open: () => void } {
  let open = (): void => {}
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return { opened, open }
}
