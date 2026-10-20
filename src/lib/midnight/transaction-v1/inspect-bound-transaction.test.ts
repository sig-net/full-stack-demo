import { Intent, nativeToken, Transaction, UnshieldedOffer } from '@midnightntwrk/ledger-v9'
import { bytesToHex } from '@sig-net/midnight'
import { describe, expect, test } from 'vitest'

import {
  type BoundTransactionContents,
  inspectBoundTransaction,
} from '@/lib/midnight/transaction-v1/inspect-bound-transaction'

/** A contract call and a shielded spend need proven circuits, so the deposit's integration tests cover those. */
const cases: ReadonlyArray<{
  name: string
  boundTx: string
  expected: BoundTransactionContents | undefined
}> = [
  { name: 'bytes that are not hex', boundTx: 'zz', expected: undefined },
  { name: 'bytes that are no transaction', boundTx: 'b0bd', expected: undefined },
  {
    name: 'an unproven transaction',
    boundTx: bytesToHex(Transaction.fromParts('undeployed').serialize()),
    expected: undefined,
  },
  {
    name: 'a bound transaction without intents',
    boundTx: bytesToHex(Transaction.fromParts('undeployed').mockProve().serialize()),
    expected: { actions: [], spendsCoins: false },
  },
  {
    name: 'a bound transaction carrying an unshielded offer',
    boundTx: bytesToHex(unshieldedTransfer().mockProve().serialize()),
    expected: { actions: [], spendsCoins: true },
  },
]

describe('inspectBoundTransaction', () => {
  test.each(cases)('$name', ({ boundTx, expected }) => {
    expect(inspectBoundTransaction(boundTx)).toEqual(expected)
  })
})

function unshieldedTransfer(): ReturnType<typeof Transaction.fromParts> {
  const intent = Intent.new(new Date('2100-01-01T00:00:00Z'))
  intent.fallibleUnshieldedOffer = UnshieldedOffer.new(
    [],
    [{ value: 1n, owner: '00'.repeat(32), type: nativeToken().raw }],
    [],
  )
  return Transaction.fromParts('undeployed', undefined, undefined, intent)
}
