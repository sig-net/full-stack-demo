import type { Approval } from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval'

/** A router approval in `AwaitingStartTransaction`, as started, for tests that start from a stored row. */
export function approvalFixture(overrides: Partial<Approval> = {}): Approval {
  return {
    name: APPROVAL_NAME,
    kind: 'router',
    erc20Address: ERC20_ADDRESS,
    spender: ROUTER_ADDRESS,
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
export const APPROVAL_NAME = `${CALLER_NAME}/ethereum-erc20-vault-approvals/3b4c5d6e-7f80-4912-8a2b-3c4d5e6f7a8b`

export const ERC20_ADDRESS = `0x${'ef'.repeat(20)}`
export const ROUTER_ADDRESS = `0x${'0a'.repeat(20)}`
export const VAULT_ACCOUNT = `0x${'cc'.repeat(20)}`
export const IN_INDEX = 42n

/** The row each state leaves behind, consistent with the state machine's field table. */
export const APPROVAL_IN_STATE: Record<Approval['state'], Approval> = {
  AwaitingStartTransaction: approvalFixture(),
  AwaitingVaultRequest: approvalFixture({ state: 'AwaitingVaultRequest' }),
  AwaitingCompletion: approvalFixture({ state: 'AwaitingCompletion' }),
  AwaitingCompleteTransaction: approvalFixture({ state: 'AwaitingCompleteTransaction' }),
  Completed: approvalFixture({ state: 'Completed', outcome: 'approved' }),
  Failed: approvalFixture({ state: 'Failed', failure: 'StartFailed', error: 'boom' }),
}
