import type { Deposit } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'

/** A deposit in `AwaitingStartTransaction`, as started, for tests that start from a stored row. */
export function depositFixture(overrides: Partial<Deposit> = {}): Deposit {
  return {
    name: DEPOSIT_NAME,
    erc20Address: ERC20_ADDRESS,
    amount: 1_000_000n,
    state: 'AwaitingStartTransaction',
    inIndex: IN_INDEX,
    evmNonce: 7n,
    gasLimit: 100_000n,
    maxFeePerGas: 30_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
    depositAccount: DEPOSIT_ACCOUNT,
    outcome: null,
    failure: null,
    error: null,
    createTime: new Date('2026-01-01T00:00:00Z'),
    updateTime: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

export const CALLER_NAME = `callers/${'ab'.repeat(32)}`
export const DEPOSIT_NAME = `${CALLER_NAME}/ethereum-erc20-vault-deposits/1f2e3d4c-5b6a-4798-8a9b-0c1d2e3f4a5b`

export const ERC20_ADDRESS = `0x${'ef'.repeat(20)}`
export const DEPOSIT_ACCOUNT = `0x${'cd'.repeat(20)}`
export const IN_INDEX = 42n

/** The row each state leaves behind, consistent with the state machine's field table. */
export const DEPOSIT_IN_STATE: Record<Deposit['state'], Deposit> = {
  AwaitingStartTransaction: depositFixture(),
  AwaitingVaultRequest: depositFixture({ state: 'AwaitingVaultRequest' }),
  AwaitingCompletion: depositFixture({ state: 'AwaitingCompletion' }),
  AwaitingCompleteTransaction: depositFixture({ state: 'AwaitingCompleteTransaction' }),
  Completed: depositFixture({ state: 'Completed', outcome: 'minted' }),
  Failed: depositFixture({ state: 'Failed', failure: 'StartFailed', error: 'boom' }),
}
