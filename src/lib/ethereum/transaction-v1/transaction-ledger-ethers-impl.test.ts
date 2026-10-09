import { type Provider, Transaction, TransactionReceipt } from 'ethers'
import { describe, expect, test } from 'vitest'

import {
  SIGNED_TRANSACTION,
  SIGNED_TX,
  TX_HASH,
} from '@/lib/ethereum/transaction-v1/transaction-fixtures'
import type { EthereumLedgerTransactionStatus } from '@/lib/ethereum/transaction-v1/transaction-ledger'
import { EthereumTransactionLedgerEthersImpl } from '@/lib/ethereum/transaction-v1/transaction-ledger-ethers-impl'
import { mock } from '@/lib/testing/mock'

const SENDER = SIGNED_TRANSACTION.from ?? ''
const NONCE = SIGNED_TRANSACTION.nonce

function ledgerWith(provider: Partial<Provider>): EthereumTransactionLedgerEthersImpl {
  return new EthereumTransactionLedgerEthersImpl(mock<Provider>('Provider', provider))
}

/** A receipt for the fixture transaction with the given status, as the node would return it. */
function receipt(status: number | null, blockNumber = 100): TransactionReceipt {
  return new TransactionReceipt(
    {
      to: SENDER,
      from: SENDER,
      contractAddress: null,
      hash: TX_HASH,
      index: 0,
      blockHash: `0x${'22'.repeat(32)}`,
      blockNumber,
      logsBloom: `0x${'00'.repeat(256)}`,
      logs: [],
      gasUsed: 21_000n,
      cumulativeGasUsed: 21_000n,
      type: 2,
      status,
      root: null,
    },
    mock<Provider>('Provider'),
  )
}

/** A refusal as ethers raises it: an error carrying a code. */
function coded(message: string, code: string): Error {
  return Object.assign(new Error(message), { code })
}

describe('EthereumTransactionLedgerEthersImpl.broadcast', () => {
  test('bytes the chain already mined resolve with the hash and are not sent again', async () => {
    const ledger = ledgerWith({ getTransactionReceipt: async () => receipt(1) })
    expect(await ledger.broadcast(SIGNED_TX)).toBe(TX_HASH)
  })

  test('bytes the node has not seen are sent and resolve with the hash', async () => {
    const sent: string[] = []
    const ledger = ledgerWith({
      getTransactionReceipt: async () => null,
      broadcastTransaction: async (signedTx) => {
        sent.push(signedTx)
        throw new Error('the response is not read')
      },
    })
    await expect(ledger.broadcast(SIGNED_TX)).rejects.toThrow('the response is not read')
    expect(sent).toEqual([SIGNED_TX])
  })

  const alreadySubmitted: ReadonlyArray<[string, Error]> = [
    ['NONCE_EXPIRED', coded('nonce has already been used', 'NONCE_EXPIRED')],
    ['already known', new Error('already known')],
    ['already imported', new Error('Transaction already imported')],
    ['AlreadyKnown', new Error('AlreadyKnown')],
    ['nonce too low', new Error('Nonce too low. Expected nonce to be 8 but got 7.')],
  ]

  test.each(alreadySubmitted)(
    'a node that already holds the bytes (%s) is not an error',
    async (_name, error) => {
      const ledger = ledgerWith({
        getTransactionReceipt: async () => null,
        broadcastTransaction: async () => {
          throw error
        },
      })
      expect(await ledger.broadcast(SIGNED_TX)).toBe(TX_HASH)
    },
  )

  test('any other refusal propagates', async () => {
    const ledger = ledgerWith({
      getTransactionReceipt: async () => null,
      broadcastTransaction: async () => {
        throw coded('insufficient funds', 'INSUFFICIENT_FUNDS')
      },
    })
    await expect(ledger.broadcast(SIGNED_TX)).rejects.toThrow('insufficient funds')
  })

  test('bytes without a signature are refused before reaching the node', async () => {
    const unsigned = Transaction.from({ ...SIGNED_TRANSACTION.toJSON(), signature: null })
    await expect(ledgerWith({}).broadcast(unsigned.unsignedSerialized)).rejects.toThrow(
      'carry no signature',
    )
  })
})

describe('EthereumTransactionLedgerEthersImpl.status', () => {
  const cases: ReadonlyArray<{
    name: string
    count: number
    receipts: ReadonlyArray<TransactionReceipt | null>
    expected: EthereumLedgerTransactionStatus
  }> = [
    {
      name: 'a count at the nonce is pending, with no receipt read',
      count: NONCE,
      receipts: [],
      expected: { outcome: 'pending' },
    },
    {
      name: 'a count past the nonce with a receipt of status 1 is mined',
      count: NONCE + 1,
      receipts: [receipt(1, 7)],
      expected: { outcome: 'mined', blockNumber: 7n },
    },
    {
      name: 'a count past the nonce with a receipt of status 0 is reverted',
      count: NONCE + 1,
      receipts: [receipt(0, 9)],
      expected: { outcome: 'reverted', blockNumber: 9n },
    },
    {
      name: 'a count past the nonce with no receipt is a consumed nonce',
      count: NONCE + 1,
      receipts: [null],
      expected: { outcome: 'nonceConsumed' },
    },
  ]

  test.each(cases)('$name', async ({ count, receipts, expected }) => {
    const pending = [...receipts]
    const ledger = ledgerWith({
      getTransactionCount: async (address, blockTag) => {
        expect(address).toBe(SENDER)
        expect(blockTag).toBe('latest')
        return count
      },
      getTransactionReceipt: async (hash) => {
        expect(hash).toBe(TX_HASH)
        const next = pending.shift()
        if (next === undefined) throw new Error('read the receipt more often than the case allows')
        return next
      },
    })
    expect(await ledger.status({ txHash: TX_HASH, from: SENDER, nonce: NONCE })).toEqual(expected)
    expect(pending).toEqual([])
  })

  test('a receipt without a status is an error, not a status', async () => {
    const ledger = ledgerWith({
      getTransactionCount: async () => NONCE + 1,
      getTransactionReceipt: async () => receipt(null),
    })
    await expect(ledger.status({ txHash: TX_HASH, from: SENDER, nonce: NONCE })).rejects.toThrow(
      'carries no status',
    )
  })
})
