import type {
  ApprovalActivity,
  DepositActivity,
  SwapActivity,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity'
import {
  APPROVAL_NAME,
  ROUTER_ADDRESS,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-fixtures'
import {
  DEPOSIT_NAME,
  ERC20_ADDRESS,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-fixtures'
import {
  ERC20_ADDRESS_OUT,
  SWAP_NAME,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-fixtures'

/** A pending deposit's activity with its start call submitted, for tests that read the view. */
export function activityFixture(overrides: Partial<DepositActivity> = {}): DepositActivity {
  return {
    name: DEPOSIT_NAME,
    type: 'Deposit',
    state: 'Pending',
    erc20Address: ERC20_ADDRESS,
    amount: 1_000_000n,
    erc20AddressOut: null,
    amountOut: null,
    spender: null,
    outcome: null,
    error: null,
    resourceState: 'AwaitingStartTransaction',
    vaultRequestState: null,
    vaultRequestId: null,
    walletTransaction: null,
    startTransaction: {
      hash: START_TX_HASH,
      state: 'Pending',
      lifecycleState: 'AwaitingInclusion',
    },
    foreignChainTransaction: null,
    completeTransaction: null,
    createTime: new Date('2026-01-01T00:00:00Z'),
    updateTime: new Date('2026-01-01T00:01:00Z'),
    ...overrides,
  }
}

/** A pending swap's activity, selling up to 1.1 of the sold token for exactly 1 of the bought one. */
export function swapActivityFixture(overrides: Partial<SwapActivity> = {}): SwapActivity {
  return {
    ...activityFixture(),
    name: SWAP_NAME,
    type: 'Swap',
    amount: 1_100_000n,
    erc20AddressOut: ERC20_ADDRESS_OUT,
    amountOut: 1_000_000n,
    outcome: null,
    ...overrides,
  }
}

/** A pending router approval's activity. */
export function approvalActivityFixture(
  overrides: Partial<ApprovalActivity> = {},
): ApprovalActivity {
  return {
    ...activityFixture(),
    name: APPROVAL_NAME,
    type: 'Approval',
    amount: null,
    spender: ROUTER_ADDRESS,
    outcome: null,
    ...overrides,
  }
}

export const START_TX_HASH = '11'.repeat(32)
