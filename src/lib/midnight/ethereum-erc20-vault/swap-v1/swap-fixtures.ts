import type { Swap } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap'

/** A swap in `AwaitingStartTransaction`, as started, for tests that start from a stored row. */
export function swapFixture(overrides: Partial<Swap> = {}): Swap {
  return {
    name: SWAP_NAME,
    erc20AddressIn: ERC20_ADDRESS_IN,
    erc20AddressOut: ERC20_ADDRESS_OUT,
    fee: 500n,
    amountOut: 1_000_000n,
    amountInMaximum: 1_100_000n,
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
export const SWAP_NAME = `${CALLER_NAME}/ethereum-erc20-vault-swaps/2a3b4c5d-6e7f-4890-9a1b-2c3d4e5f6a7b`

export const ERC20_ADDRESS_IN = `0x${'ef'.repeat(20)}`
export const ERC20_ADDRESS_OUT = `0x${'0e'.repeat(20)}`
export const VAULT_ACCOUNT = `0x${'cc'.repeat(20)}`
export const USER_COMMITMENT = '1c'.repeat(32)
export const IN_INDEX = 42n

/** The row each state leaves behind, consistent with the state machine's field table. */
export const SWAP_IN_STATE: Record<Swap['state'], Swap> = {
  AwaitingStartTransaction: swapFixture(),
  AwaitingVaultRequest: swapFixture({ state: 'AwaitingVaultRequest' }),
  AwaitingCompletion: swapFixture({ state: 'AwaitingCompletion' }),
  AwaitingCompleteTransaction: swapFixture({ state: 'AwaitingCompleteTransaction' }),
  Completed: swapFixture({ state: 'Completed', outcome: 'swapped' }),
  Failed: swapFixture({ state: 'Failed', failure: 'StartFailed', error: 'boom' }),
}
