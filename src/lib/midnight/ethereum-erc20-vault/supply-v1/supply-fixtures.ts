import type { Supply } from '@/lib/midnight/ethereum-erc20-vault/supply-v1/supply'

/** A supply in `AwaitingStartTransaction`, as started, for tests that start from a stored row. */
export function supplyFixture(overrides: Partial<Supply> = {}): Supply {
  return {
    name: SUPPLY_NAME,
    underlyingErc20Address: UNDERLYING_ERC20_ADDRESS,
    stataErc20Address: STATA_ERC20_ADDRESS,
    amount: 1_000_000n,
    state: 'AwaitingStartTransaction',
    inIndex: IN_INDEX,
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
export const SUPPLY_NAME = `${CALLER_NAME}/ethereum-erc20-vault-supplies/5d6e7f80-91a2-4b3c-8d4e-6f7a8b9c0d1e`

export const UNDERLYING_ERC20_ADDRESS = `0x${'ea'.repeat(20)}`
export const STATA_ERC20_ADDRESS = `0x${'5a'.repeat(20)}`
export const VAULT_ACCOUNT = `0x${'cc'.repeat(20)}`
export const IN_INDEX = 43n

/** The row each state leaves behind, consistent with the state machine's field table. */
export const SUPPLY_IN_STATE: Record<Supply['state'], Supply> = {
  AwaitingStartTransaction: supplyFixture(),
  AwaitingVaultRequest: supplyFixture({ state: 'AwaitingVaultRequest' }),
  AwaitingCompletion: supplyFixture({ state: 'AwaitingCompletion' }),
  AwaitingCompleteTransaction: supplyFixture({ state: 'AwaitingCompleteTransaction' }),
  Completed: supplyFixture({ state: 'Completed', outcome: 'supplied' }),
  Failed: supplyFixture({ state: 'Failed', failure: 'StartFailed', error: 'boom' }),
}
