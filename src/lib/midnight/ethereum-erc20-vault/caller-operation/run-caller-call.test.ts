import { describe, expect, test } from 'vitest'

import {
  type CallerCall,
  type CallRefusal,
  runCallerCall,
  type RunCallerCallOptions,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/run-caller-call'
import type { CallerCircuitArgs } from '@/lib/midnight/ethereum-erc20-vault/vault-call'
import type { Wallet } from '@/lib/midnight/wallet/wallet'
import { mock } from '@/lib/testing/mock'

const CALLER_SECRET = 'ab'.repeat(32)
const PUBLIC_KEYS = { coinPublicKey: 'aa'.repeat(32), encryptionPublicKey: 'bb'.repeat(32) }
const REFUSED: CallRefusal = { ok: false, error: 'the slot is live', reason: 'slotConflict' }
const ACCEPTED = { ok: true, resource: 'stored' } as const

type Recorded = typeof ACCEPTED | CallRefusal

/** A call whose record answers from a script, over a wallet that logs what it finalises and releases. */
function callOver(answers: ReadonlyArray<Recorded | Error>) {
  const events: string[] = []
  const remaining = [...answers]
  const wallet = mock<Wallet>('Wallet', {
    publicKeys: PUBLIC_KEYS,
    finalize: async (unboundTx) => {
      events.push(`finalize(${unboundTx})`)
      return `finalized(${unboundTx})`
    },
    release: async (finalizedTx) => {
      events.push(`release(${finalizedTx})`)
    },
  })
  const call: CallerCall<{ inIndex: bigint }, CallerCircuitArgs, Recorded> = {
    operation: 'deposit',
    wallet,
    callerSecret: CALLER_SECRET,
    prepare: async () => ({ ok: true, inputs: { inIndex: 42n } }),
    circuitArgs: (_inputs, caller) => caller,
    build: async () => {
      events.push('build')
      return 'unbound'
    },
    record: async (_inputs, finalizedTx) => {
      events.push(`record(${finalizedTx})`)
      const answer = remaining.shift()
      if (answer === undefined) throw new Error('the case scripts no record answer')
      if (answer instanceof Error) throw answer
      return answer
    },
  }
  return { call, events }
}

describe('runCallerCall releases the finalised bytes the server does not record', () => {
  const cases: ReadonlyArray<{
    name: string
    answers: ReadonlyArray<Recorded | Error>
    options?: RunCallerCallOptions
    expectEvents: string[]
    expectError?: string
  }> = [
    {
      name: 'a recorded call keeps its coins',
      answers: [ACCEPTED],
      expectEvents: ['build', 'finalize(unbound)', 'record(finalized(unbound))'],
    },
    {
      name: 'a refused record releases, then the refusal surfaces',
      answers: [REFUSED],
      expectEvents: [
        'build',
        'finalize(unbound)',
        'record(finalized(unbound))',
        'release(finalized(unbound))',
      ],
      expectError: 'the slot is live',
    },
    {
      name: 'a record that throws releases, then the error surfaces',
      answers: [new Error('network down')],
      expectEvents: [
        'build',
        'finalize(unbound)',
        'record(finalized(unbound))',
        'release(finalized(unbound))',
      ],
      expectError: 'network down',
    },
    {
      name: 'a retried refusal releases before the second attempt finalises',
      answers: [REFUSED, ACCEPTED],
      options: { retryOnce: (refusal) => refusal.reason === 'slotConflict' },
      expectEvents: [
        'build',
        'finalize(unbound)',
        'record(finalized(unbound))',
        'release(finalized(unbound))',
        'build',
        'finalize(unbound)',
        'record(finalized(unbound))',
      ],
    },
  ]

  test.each(cases)('$name', async ({ answers, options, expectEvents, expectError }) => {
    const { call, events } = callOver(answers)
    const running = runCallerCall(call, options)
    if (expectError === undefined) expect(await running).toEqual(ACCEPTED)
    else await expect(running).rejects.toThrow(expectError)
    expect(events).toEqual(expectEvents)
  })
})
