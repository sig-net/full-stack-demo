import { computeAddress, keccak256, SigningKey, Transaction } from 'ethers'

import type { EthereumTransaction } from '@/lib/ethereum/transaction-v1/transaction'

/** A transaction in `AwaitingSubmission`, as committed, for tests that start from a stored row. */
export function transactionFixture(
  overrides: Partial<EthereumTransaction> = {},
): EthereumTransaction {
  return {
    name: TRANSACTION_NAME,
    parent: VAULT_REQUEST_NAME,
    state: 'AwaitingSubmission',
    signedTx: SIGNED_TX,
    txHash: null,
    blockNumber: null,
    expireTime: new Date('2100-01-01T00:00:00Z'),
    failure: null,
    error: null,
    createTime: new Date('2026-01-01T00:00:00Z'),
    updateTime: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

export const CALLER_NAME = `callers/${'ab'.repeat(32)}`
export const VAULT_REQUEST_NAME = `${CALLER_NAME}/ethereum-erc20-vault-requests/1f2e3d4c-5b6a-4798-8a9b-0c1d2e3f4a5b`
export const TRANSACTION_NAME = `${CALLER_NAME}/ethereum-transactions/0d8c7d10-6a3e-4d7e-9f1c-2b7a1c3d4e5f`

/** A zero-value self-transfer at nonce 7, signed with a throwaway key, so the bytes parse as signed. */
export const SIGNED_TRANSACTION: Transaction = signedSelfTransfer()
export const SIGNED_TX: string = SIGNED_TRANSACTION.serialized
export const TX_HASH: string = keccak256(SIGNED_TX)

function signedSelfTransfer(): Transaction {
  const key = new SigningKey(`0x${'11'.repeat(32)}`)
  const transaction = Transaction.from({
    type: 2,
    chainId: 11155111,
    nonce: 7,
    to: computeAddress(key.publicKey),
    value: 0,
    gasLimit: 21_000,
    maxFeePerGas: 30_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
  })
  transaction.signature = key.sign(transaction.unsignedHash)
  return transaction
}

/** The row each state leaves behind, consistent with the state machine's field table. */
export const TRANSACTION_IN_STATE: Record<EthereumTransaction['state'], EthereumTransaction> = {
  AwaitingSubmission: transactionFixture(),
  AwaitingInclusion: transactionFixture({ state: 'AwaitingInclusion', txHash: TX_HASH }),
  Succeeded: transactionFixture({ state: 'Succeeded', txHash: TX_HASH, blockNumber: 100n }),
  Failed: transactionFixture({ state: 'Failed', failure: 'Rejected', error: 'invalid sender' }),
}
