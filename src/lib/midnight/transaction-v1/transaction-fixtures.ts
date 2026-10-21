import type { MidnightTransaction } from '@/lib/midnight/transaction-v1/transaction'

/** A transaction in `AwaitingProof`, as committed, for tests that start from a stored row. */
export function transactionFixture(
  overrides: Partial<MidnightTransaction> = {},
): MidnightTransaction {
  return {
    name: TRANSACTION_NAME,
    parent: DEPOSIT_NAME,
    state: 'AwaitingProof',
    circuit: 'sendDeposit',
    signer: 'relayer',
    unprovenTx: 'unproven',
    unboundTx: null,
    finalizedTx: null,
    expireTime: new Date('2100-01-01T00:00:00Z'),
    txId: null,
    blockHeight: null,
    failure: null,
    error: null,
    createTime: new Date('2026-01-01T00:00:00Z'),
    updateTime: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

export const CALLER_NAME = `callers/${'ab'.repeat(32)}`
export const DEPOSIT_NAME = `${CALLER_NAME}/ethereum-erc20-vault-deposits/1f2e3d4c-5b6a-4798-8a9b-0c1d2e3f4a5b`
export const TRANSACTION_NAME = `${CALLER_NAME}/midnight-transactions/0d8c7d10-6a3e-4d7e-9f1c-2b7a1c3d4e5f`
export const BLOCK_HEIGHT = 8562

/**
 * The row each state leaves behind, consistent with the state machine's field table: the relayer's
 * unproven shape, with `unboundTx` set from `AwaitingWallet` on.
 */
export const TRANSACTION_IN_STATE: Record<MidnightTransaction['state'], MidnightTransaction> = {
  AwaitingProof: transactionFixture(),
  AwaitingWallet: transactionFixture({
    state: 'AwaitingWallet',
    unprovenTx: null,
    unboundTx: 'unbound',
  }),
  AwaitingSubmission: transactionFixture({
    state: 'AwaitingSubmission',
    unprovenTx: null,
    unboundTx: 'unbound',
    finalizedTx: 'finalized',
  }),
  AwaitingInclusion: transactionFixture({
    state: 'AwaitingInclusion',
    unprovenTx: null,
    unboundTx: 'unbound',
    finalizedTx: 'finalized',
    txId: 'tx-1',
  }),
  Succeeded: transactionFixture({
    state: 'Succeeded',
    unprovenTx: null,
    unboundTx: 'unbound',
    finalizedTx: 'finalized',
    txId: 'tx-1',
    blockHeight: BLOCK_HEIGHT,
  }),
  Failed: transactionFixture({
    state: 'Failed',
    unprovenTx: null,
    failure: 'ProofFailed',
    error: 'boom',
  }),
}

/** `AwaitingSubmission` as a caller call enters it: finalised by the caller's wallet, never proven by the backend. */
export const CALLER_TRANSACTION_AWAITING_SUBMISSION: MidnightTransaction = transactionFixture({
  signer: 'caller',
  circuit: 'completeDeposit',
  state: 'AwaitingSubmission',
  unprovenTx: null,
  finalizedTx: 'finalized',
})
