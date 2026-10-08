import type { Deposit } from '@/lib/midnight/erc20-vault/deposit-v1/Deposit'

/** Durable storage of deposit resources, keyed by resource name. */
export interface DepositRepository {
  /** Inserts the deposit, or replaces the row with the same name. */
  upsertDeposit(deposit: Deposit): Promise<Deposit>
  getDeposit(name: string): Promise<Deposit | undefined>
}
