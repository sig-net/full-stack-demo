import { CallTxFailedError } from '@midnight-ntwrk/midnight-js/contracts'
import { FailEntirely, FailFallible, type FinalizedTxData } from '@midnight-ntwrk/midnight-js/types'
import { describe, expect, test, vi } from 'vitest'

import { FlusherImpl } from '@/lib/midnight/ethereum-erc20-vault/flusher-impl'
import { mock } from '@/lib/testing/mock'

interface Case {
  name: string
  /** What each run of the SDK flush answers, in order: the slots it filled, or the error it throws. */
  runs: (number | Error)[]
  expectRuns: number
  expectNudges: number
  expectLogged: boolean
}

function landedAs(status: FinalizedTxData['status']): CallTxFailedError {
  return new CallTxFailedError(mock<FinalizedTxData>('FinalizedTxData', { status }), 'flushQueue')
}

const cases: Case[] = [
  {
    name: 'nothing waits, so one run and no nudge',
    runs: [0],
    expectRuns: 1,
    expectNudges: 0,
    expectLogged: false,
  },
  {
    name: 'a flush lands, so the waiting requests are nudged and the queue is read again',
    runs: [3, 0],
    expectRuns: 2,
    expectNudges: 1,
    expectLogged: false,
  },
  {
    name: 'two full flushes land before the queue drains',
    runs: [10, 10, 0],
    expectRuns: 3,
    expectNudges: 2,
    expectLogged: false,
  },
  {
    name: 'a flush that landed as FailFallible lost a race, so it runs again',
    runs: [landedAs(FailFallible), 0],
    expectRuns: 2,
    expectNudges: 0,
    expectLogged: false,
  },
  {
    name: 'a build refused by "Request not queued" lost a race, so it runs again',
    runs: [new Error('failed assert: Request not queued'), 0],
    expectRuns: 2,
    expectNudges: 0,
    expectLogged: false,
  },
  {
    name: 'a build refused by "Attestation not queued" lost a race, so it runs again',
    runs: [new Error('failed assert: Attestation not queued'), 0],
    expectRuns: 2,
    expectNudges: 0,
    expectLogged: false,
  },
  {
    name: 'a build refused by "Identical request open" lost a race, so it runs again',
    runs: [new Error('failed assert: Identical request open'), 0],
    expectRuns: 2,
    expectNudges: 0,
    expectLogged: false,
  },
  {
    name: 'a flush that landed as FailEntirely is logged and ends the run',
    runs: [landedAs(FailEntirely)],
    expectRuns: 1,
    expectNudges: 0,
    expectLogged: true,
  },
  {
    name: 'another assert is logged and ends the run',
    runs: [new Error('failed assert: Vault not initialised')],
    expectRuns: 1,
    expectNudges: 0,
    expectLogged: true,
  },
  {
    name: 'a failure to read the ledger is logged and ends the run',
    runs: [new Error('indexer unreachable')],
    expectRuns: 1,
    expectNudges: 0,
    expectLogged: true,
  },
]

describe('FlusherImpl', () => {
  test.each(cases)('$name', async ({ runs, expectRuns, expectNudges, expectLogged }) => {
    const scripted = [...runs]
    let ran = 0
    let nudged = 0
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const flusher = new FlusherImpl(
        async () => {
          ran += 1
          const answer = scripted.shift()
          if (answer === undefined)
            throw new Error('the flush ran more often than the test scripted')
          if (answer instanceof Error) throw answer
          return answer
        },
        async () => {
          nudged += 1
        },
      )
      await flusher.flush()
      expect(ran).toBe(expectRuns)
      expect(nudged).toBe(expectNudges)
      expect(logged).toHaveBeenCalledTimes(expectLogged ? 1 : 0)
    } finally {
      logged.mockRestore()
    }
  })

  test('a call during a run shares the promise and makes the run go once more', async () => {
    const firstRun = gate()
    let ran = 0
    const flusher = new FlusherImpl(
      async () => {
        ran += 1
        if (ran === 1) await firstRun.opened
        return 0
      },
      () => Promise.reject(new Error('nothing landed, so nothing is nudged')),
    )
    const first = flusher.flush()
    const second = flusher.flush()
    expect(second).toBe(first)
    expect(ran).toBe(1)
    firstRun.open()
    await first
    expect(ran).toBe(2)

    await flusher.flush()
    expect(ran).toBe(3)
  })

  test('a failed nudge rejects the flush and the next call starts a new run', async () => {
    let ran = 0
    const flusher = new FlusherImpl(
      async () => {
        ran += 1
        return 1
      },
      () => Promise.reject(new Error('database unreachable')),
    )
    await expect(flusher.flush()).rejects.toThrow('database unreachable')
    expect(ran).toBe(1)
    await expect(flusher.flush()).rejects.toThrow('database unreachable')
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
