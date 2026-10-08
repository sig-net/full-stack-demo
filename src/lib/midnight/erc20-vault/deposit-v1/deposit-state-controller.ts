import type { Caller } from '@/lib/caller/caller'
import type { Deposit, DepositRequest } from '@/lib/midnight/erc20-vault/deposit-v1/deposit'

/** Drives a deposit through its states. Callers hand it validated values, so it never parses. */
export interface DepositStateController {
  startDeposit(args: StartDepositArgs): Promise<Deposit>
  resolveDepositState(args: ResolveDepositStateArgs): Promise<Deposit>
}

/** The controller assigns the server-chosen deposit fields and creates the start transaction. */
export interface StartDepositArgs {
  caller: Caller
  name: string
  depositRequest: DepositRequest
}

export interface ResolveDepositStateArgs {
  name: string
}
