import { z } from 'zod'

import { defineEvent, type EventDefinition } from '@/lib/event/event'
import {
  type Deposit,
  depositNameSchema,
  type DepositOutcome,
  type DepositState,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'

/**
 * The only writer of a deposit's state. Each `record` method is one transition from the state
 * machine in `deposit-state-machine.ts`: it refuses with `DepositStateConflict` when the deposit
 * is not in the state the action applies to, and publishes the event of the state entered. The
 * two user actions, `startDeposit` and `completeDeposit`, also commit the caller's circuit call
 * under the deposit, and `recordStarted` queues the vault request. Methods open no transaction:
 * the caller is the write boundary.
 */
export interface DepositStateController {
  /** Stores a deposit in `AwaitingStartTransaction` and commits the caller's start call under it. */
  startDeposit(args: StartDepositArgs): Promise<Deposit>
  /** `AwaitingStartTransaction` to `AwaitingVaultRequest`, queueing the vault request the start call put on chain. */
  recordStarted(args: RecordStartedArgs): Promise<Deposit>
  /** `AwaitingStartTransaction` to `Failed` as `StartFailed`. */
  recordStartFailure(args: RecordStartFailureArgs): Promise<Deposit>
  /** `AwaitingVaultRequest` to `AwaitingCompletion`, once the vault request is attested. */
  recordAttested(args: RecordAttestedArgs): Promise<Deposit>
  /** `AwaitingCompletion` to `AwaitingCompleteTransaction`, committing the caller's complete call under the deposit. */
  completeDeposit(args: CompleteDepositArgs): Promise<Deposit>
  /** `AwaitingCompleteTransaction` to `Completed`, with what the complete call did. */
  recordCompleted(args: RecordCompletedArgs): Promise<Deposit>
  /** `AwaitingCompleteTransaction` back to `AwaitingCompletion`: the caller may complete again. */
  recordCompleteFailure(args: RecordCompleteFailureArgs): Promise<Deposit>
}

export interface StartDepositArgs {
  deposit: Deposit
  /** The start circuit call, built with the deposit's assigned fields. */
  unprovenTx: string
}

export interface RecordStartedArgs {
  name: string
}

export interface RecordStartFailureArgs {
  name: string
  error: string
}

export interface RecordAttestedArgs {
  name: string
}

export interface CompleteDepositArgs {
  name: string
  /** The complete circuit call, built for the deposit's attested request. */
  unprovenTx: string
}

export interface RecordCompletedArgs {
  name: string
  outcome: DepositOutcome
}

export interface RecordCompleteFailureArgs {
  name: string
}

/** The deposit is not in a state the action applies to, so another actor got there first. */
export class DepositStateConflict extends Error {
  readonly name = 'DepositStateConflict'

  constructor(depositName: string, state: DepositState, action: string) {
    super(`${depositName} is ${state}, which does not allow ${action}`)
  }
}

/** A deposit has no parent, so its events name only the deposit. */
export const depositEventDataSchema = z.object({
  name: depositNameSchema,
})

export type DepositEventData = z.infer<typeof depositEventDataSchema>

/** One lifecycle event per state entered, keyed by the deposit name. */
export const DEPOSIT_EVENT_BY_STATE: Record<DepositState, EventDefinition<DepositEventData>> = {
  AwaitingStartTransaction: defineEvent(
    'midnight.ethereum-erc20-vault.deposit-v1.awaiting-start-transaction',
    depositEventDataSchema,
  ),
  AwaitingVaultRequest: defineEvent(
    'midnight.ethereum-erc20-vault.deposit-v1.awaiting-vault-request',
    depositEventDataSchema,
  ),
  AwaitingCompletion: defineEvent(
    'midnight.ethereum-erc20-vault.deposit-v1.awaiting-completion',
    depositEventDataSchema,
  ),
  AwaitingCompleteTransaction: defineEvent(
    'midnight.ethereum-erc20-vault.deposit-v1.awaiting-complete-transaction',
    depositEventDataSchema,
  ),
  Completed: defineEvent(
    'midnight.ethereum-erc20-vault.deposit-v1.completed',
    depositEventDataSchema,
  ),
  Failed: defineEvent('midnight.ethereum-erc20-vault.deposit-v1.failed', depositEventDataSchema),
}

export const DEPOSIT_EVENTS: readonly EventDefinition<DepositEventData>[] =
  Object.values(DEPOSIT_EVENT_BY_STATE)
