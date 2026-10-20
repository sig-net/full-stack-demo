import type { VaultCircuitId } from '@sig-net/midnight-examples-erc20-vault-contract'
import { z } from 'zod'

import type { Caller } from '@/lib/caller/caller'
import {
  type Deposit,
  type DepositCompleteInputs,
  depositNameSchema,
  depositRequestSchema,
  type DepositStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import { hexBytesSchema, uint64Schema } from '@/lib/value-schemas'

/**
 * The deposit API's methods, independent of the transport that exposes them. The browser builds,
 * proves and binds the caller's two circuit calls from the inputs the prepare methods return,
 * and the two user actions commit the bound bytes. The server checks that the bound bytes are
 * exactly one call to the vault's expected circuit spending no coins, since the relayer pays their
 * fee, and does not inspect the inputs the call carries.
 */
export interface DepositService {
  /** The start circuit's server-decided inputs, assigned afresh on every call and verified again at `startDeposit`, with nothing written. */
  prepareStartDeposit(caller: Caller, args: PrepareStartDepositArgs): Promise<DepositStartInputs>
  /** Stores the deposit in `AwaitingStartTransaction` with the bound start call under it, refusing a nonce the chain or a live deposit has moved past. */
  startDeposit(caller: Caller, args: StartDepositArgs): Promise<Deposit>
  /** The attested request's fields the complete circuit takes, after the checks `completeDeposit` repeats. */
  prepareCompleteDeposit(
    caller: Caller,
    args: PrepareCompleteDepositArgs,
  ): Promise<DepositCompleteInputs>
  /** Moves the deposit to `AwaitingCompleteTransaction` with the bound complete call under it. */
  completeDeposit(caller: Caller, args: CompleteDepositArgs): Promise<Deposit>
  getDeposit(caller: Caller, args: GetDepositArgs): Promise<Deposit | undefined>
  /** The caller's deposits, newest first. */
  listDeposits(caller: Caller, args: ListDepositsArgs): Promise<Deposit[]>
}

/** The completion was asked for with a wallet other than the one the deposit mints to. */
export class DepositRecipientMismatch extends Error {
  readonly name = 'DepositRecipientMismatch'

  constructor(name: string) {
    super(`${name} mints to the wallet it was started with: complete it with that wallet`)
  }
}

/** The deposit account's next nonce moved between the assignment and the commit, so the start call carries a nonce the sweep cannot use. */
export class DepositNonceConflict extends Error {
  readonly name = 'DepositNonceConflict'

  constructor(depositAccount: string) {
    super(
      `the next nonce of ${depositAccount} moved since the start call was prepared: prepare and build it again`,
    )
  }
}

/** The bound bytes are not the one vault call the action commits, alone and spending no coins, so the relayer would pay the fee of something else. */
export class DepositCallMismatch extends Error {
  readonly name = 'DepositCallMismatch'

  constructor(circuit: VaultCircuitId) {
    super(`the bound bytes must be exactly one ${circuit} call to the vault, spending no coins`)
  }
}

/** A 32-byte key as the ledger renders it, which the browser wallet reports in hex. */
const walletKeySchema = hexBytesSchema.pipe(z.string().length(64, 'expected a 32-byte key in hex'))

/** The browser wallet's keys: the call builder reads them for every circuit, and the complete circuit mints to the coin key. */
export const walletPublicKeysSchema = z.object({
  coinPublicKey: walletKeySchema,
  encryptionPublicKey: walletKeySchema,
})

export const prepareStartDepositArgsSchema = z.object({
  depositRequest: depositRequestSchema,
  wallet: walletPublicKeysSchema,
})
export type PrepareStartDepositArgs = z.infer<typeof prepareStartDepositArgsSchema>

/** The two inputs the browser baked into the call travel with it, and the bound bytes are hex in the ledger's serialisation. */
export const startDepositArgsSchema = prepareStartDepositArgsSchema.extend({
  inIndex: uint64Schema,
  evmNonce: uint64Schema,
  boundTx: hexBytesSchema,
})
export type StartDepositArgs = z.infer<typeof startDepositArgsSchema>

export const prepareCompleteDepositArgsSchema = z.object({
  name: depositNameSchema,
  wallet: walletPublicKeysSchema,
})
export type PrepareCompleteDepositArgs = z.infer<typeof prepareCompleteDepositArgsSchema>

export const completeDepositArgsSchema = prepareCompleteDepositArgsSchema.extend({
  boundTx: hexBytesSchema,
})
export type CompleteDepositArgs = z.infer<typeof completeDepositArgsSchema>

export const getDepositArgsSchema = z.object({
  name: depositNameSchema,
})
export type GetDepositArgs = z.infer<typeof getDepositArgsSchema>

export const listDepositsArgsSchema = z.object({})
export type ListDepositsArgs = z.infer<typeof listDepositsArgsSchema>
