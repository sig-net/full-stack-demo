import type { Withdraw } from '@/lib/midnight/ethereum-erc20-vault/withdraw-v1/withdraw'

/** A withdrawal in `AwaitingStartTransaction`, as started, for tests that start from a stored row. */
export function withdrawFixture(overrides: Partial<Withdraw> = {}): Withdraw {
  return {
    name: WITHDRAW_NAME,
    erc20Address: ERC20_ADDRESS,
    amount: 1_000_000n,
    destEvmAddress: DESTINATION,
    state: 'AwaitingStartTransaction',
    inIndex: IN_INDEX,
    userCommitment: USER_COMMITMENT,
    vaultAccount: VAULT_ACCOUNT,
    outcome: null,
    failure: null,
    error: null,
    createTime: new Date('2026-01-01T00:00:00Z'),
    updateTime: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

export const CALLER_NAME = `callers/${'ab'.repeat(32)}`
export const WITHDRAW_NAME = `${CALLER_NAME}/ethereum-erc20-vault-withdraws/4c5d6e7f-8091-4a23-9b4c-5d6e7f8a9b0c`

export const ERC20_ADDRESS = `0x${'ef'.repeat(20)}`
export const DESTINATION = `0x${'d1'.repeat(20)}`
export const VAULT_ACCOUNT = `0x${'cc'.repeat(20)}`
export const USER_COMMITMENT = '1c'.repeat(32)
export const IN_INDEX = 42n

/** The row each state leaves behind, consistent with the state machine's field table. */
export const WITHDRAW_IN_STATE: Record<Withdraw['state'], Withdraw> = {
  AwaitingStartTransaction: withdrawFixture(),
  AwaitingVaultRequest: withdrawFixture({ state: 'AwaitingVaultRequest' }),
  AwaitingCompletion: withdrawFixture({ state: 'AwaitingCompletion' }),
  AwaitingCompleteTransaction: withdrawFixture({ state: 'AwaitingCompleteTransaction' }),
  Completed: withdrawFixture({ state: 'Completed', outcome: 'sent' }),
  Failed: withdrawFixture({ state: 'Failed', failure: 'StartFailed', error: 'boom' }),
}
