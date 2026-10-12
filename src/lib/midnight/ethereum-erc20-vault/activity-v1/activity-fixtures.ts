import type { Activity } from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity'
import {
  DEPOSIT_ACCOUNT,
  DEPOSIT_NAME,
  ERC20_ADDRESS,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-fixtures'

/** A pending deposit's activity with its start call submitted, for tests that read the view. */
export function activityFixture(overrides: Partial<Activity> = {}): Activity {
  return {
    name: DEPOSIT_NAME,
    type: 'Deposit',
    state: 'Pending',
    depositAccount: DEPOSIT_ACCOUNT,
    erc20Address: ERC20_ADDRESS,
    amount: 1_000_000n,
    outcome: null,
    error: null,
    startTransaction: { hash: START_TX_HASH, state: 'Pending' },
    foreignChainTransaction: null,
    completeTransaction: null,
    createTime: new Date('2026-01-01T00:00:00Z'),
    updateTime: new Date('2026-01-01T00:01:00Z'),
    ...overrides,
  }
}

export const START_TX_HASH = '11'.repeat(32)
export const FOREIGN_TX_HASH = `0x${'22'.repeat(32)}`
export const COMPLETE_TX_HASH = '33'.repeat(32)
