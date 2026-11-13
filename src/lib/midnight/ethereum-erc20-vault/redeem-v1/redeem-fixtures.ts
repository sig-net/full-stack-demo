import type { Redeem } from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem'

/** A redeem in `AwaitingStartTransaction`, as started, for tests that start from a stored row. */
export function redeemFixture(overrides: Partial<Redeem> = {}): Redeem {
  return {
    name: REDEEM_NAME,
    stataErc20Address: STATA_ERC20_ADDRESS,
    underlyingErc20Address: UNDERLYING_ERC20_ADDRESS,
    shares: 300_000n,
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
export const REDEEM_NAME = `${CALLER_NAME}/ethereum-erc20-vault-redeems/6e7f8091-a2b3-4c4d-9e5f-7a8b9c0d1e2f`

export const UNDERLYING_ERC20_ADDRESS = `0x${'ea'.repeat(20)}`
export const STATA_ERC20_ADDRESS = `0x${'5a'.repeat(20)}`
export const VAULT_ACCOUNT = `0x${'cc'.repeat(20)}`
export const USER_COMMITMENT = '1c'.repeat(32)
export const IN_INDEX = 44n

/** The row each state leaves behind, consistent with the state machine's field table. */
export const REDEEM_IN_STATE: Record<Redeem['state'], Redeem> = {
  AwaitingStartTransaction: redeemFixture(),
  AwaitingVaultRequest: redeemFixture({ state: 'AwaitingVaultRequest' }),
  AwaitingCompletion: redeemFixture({ state: 'AwaitingCompletion' }),
  AwaitingCompleteTransaction: redeemFixture({ state: 'AwaitingCompleteTransaction' }),
  Completed: redeemFixture({ state: 'Completed', outcome: 'redeemed' }),
  Failed: redeemFixture({ state: 'Failed', failure: 'StartFailed', error: 'boom' }),
}
