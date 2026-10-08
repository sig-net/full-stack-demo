import type { Caller } from '@/lib/caller/caller'
import type { Deposit } from '@/lib/midnight/erc20-vault/deposit-v1/deposit'

/** Drives a deposit through its states. Callers hand it validated values, so it never parses. */
export interface DepositStateController {
  startDeposit(args: StartDepositArgs): Promise<Deposit>
  resolveDepositState(args: ResolveDepositStateArgs): Promise<Deposit>
}

export interface StartDepositArgs {
  caller: Caller
  deposit: Deposit
}

export interface ResolveDepositStateArgs {
  name: string
}
