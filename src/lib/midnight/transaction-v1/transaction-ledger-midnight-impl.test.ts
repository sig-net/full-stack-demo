import type { ProofProvider, UnboundTransaction } from '@midnight-ntwrk/midnight-js/types'
import { Transaction } from '@midnightntwrk/ledger-v9'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { MidnightLedgerTransactionStatus } from '@/lib/midnight/transaction-v1/transaction-ledger'
import { MidnightTransactionLedgerImpl } from '@/lib/midnight/transaction-v1/transaction-ledger-midnight-impl'
import { mock } from '@/lib/testing/mock'

const INDEXER = 'http://indexer.test/graphql'
const NODE = 'http://node.test'
const PROVEN_BYTES = Uint8Array.from([1, 2, 255])

function ledgerWith(proofProvider: Partial<ProofProvider> = {}): MidnightTransactionLedgerImpl {
  return new MidnightTransactionLedgerImpl(
    async () => mock<ProofProvider>('ProofProvider', proofProvider),
    INDEXER,
    NODE,
  )
}

describe('MidnightTransactionLedgerImpl.prove', () => {
  test('deserialises the hex, proves it, and serialises what came back', async () => {
    const unproven = Transaction.fromParts('undeployed')
    const hex = Buffer.from(unproven.serialize()).toString('hex')
    const received: string[] = []
    const ledger = ledgerWith({
      proveTx: async (tx) => {
        received.push(Buffer.from(tx.serialize()).toString('hex'))
        return mock<UnboundTransaction>('UnboundTransaction', { serialize: () => PROVEN_BYTES })
      },
    })
    expect(await ledger.prove(hex)).toBe('0102ff')
    expect(received).toEqual([hex])
  })

  test('refuses bytes that are not hex before reaching the proof server', async () => {
    await expect(ledgerWith().prove('not hex')).rejects.toThrow('must be hex')
  })

  test('refuses hex that is not a transaction', async () => {
    await expect(ledgerWith().prove('deadbeef')).rejects.toThrow()
  })
})

describe('MidnightTransactionLedgerImpl.status', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function indexerAnswers(body: unknown, status = 200): { requests: unknown[] } {
    const requests: unknown[] = []
    vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
      requests.push(JSON.parse(init.body))
      return new Response(JSON.stringify(body), { status })
    })
    return { requests }
  }

  const cases: ReadonlyArray<[string, unknown, MidnightLedgerTransactionStatus]> = [
    ['no transaction yet', { data: { transactions: [] } }, { outcome: 'pending' }],
    [
      'SUCCESS',
      { data: { transactions: [{ transactionResult: { status: 'SUCCESS' } }] } },
      { outcome: 'succeeded' },
    ],
    [
      'FAILURE',
      { data: { transactions: [{ transactionResult: { status: 'FAILURE' } }] } },
      { outcome: 'failed', failure: 'FailEntirely', error: 'The ledger rejected the transaction' },
    ],
    [
      'PARTIAL_SUCCESS',
      { data: { transactions: [{ transactionResult: { status: 'PARTIAL_SUCCESS' } }] } },
      {
        outcome: 'failed',
        failure: 'FailFallible',
        error: 'The fallible section did not apply; the fee was paid',
      },
    ],
    [
      'a system transaction beside the regular one',
      { data: { transactions: [{}, { transactionResult: { status: 'SUCCESS' } }] } },
      { outcome: 'succeeded' },
    ],
  ]

  test.each(cases)('%s', async (_name, body, expected) => {
    const { requests } = indexerAnswers(body)
    expect(await ledgerWith().status('abcd')).toEqual(expected)
    expect(requests[0]).toMatchObject({ variables: { identifier: 'abcd' } })
  })

  test('a GraphQL error is an error, not a status', async () => {
    indexerAnswers({ data: { transactions: [] }, errors: [{ message: 'unknown field' }] })
    await expect(ledgerWith().status('abcd')).rejects.toThrow('refused the query: unknown field')
  })

  test('a malformed answer is an error, not a status', async () => {
    indexerAnswers({ data: { transactions: [{ transactionResult: { status: 'MAYBE' } }] } })
    await expect(ledgerWith().status('abcd')).rejects.toThrow('malformed')
  })

  test('an HTTP failure is an error, not a status', async () => {
    indexerAnswers({}, 503)
    await expect(ledgerWith().status('abcd')).rejects.toThrow('answered 503')
  })
})
