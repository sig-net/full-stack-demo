import { z } from 'zod'

import type { Caller } from '@/lib/caller/caller'
import {
  type Deposit,
  depositNameSchema,
  depositRequestSchema,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit'
import { hexBytesSchema } from '@/lib/value-schemas'

/**
 * The deposit API's methods, independent of the transport that exposes them. The two user
 * actions build the caller's circuit call, which reads the indexer and runs the circuit, and
 * then open the one transaction that stores the deposit's step and the call: the build is too
 * slow and too external to run inside it.
 */
export interface DepositService {
  /** Assigns the server-chosen fields, builds the start call and stores the deposit in `AwaitingStartTransaction`. */
  startDeposit(caller: Caller, args: StartDepositArgs): Promise<Deposit>
  /** Builds the complete call for the deposit's attested request and moves it to `AwaitingCompleteTransaction`. */
  completeDeposit(caller: Caller, args: CompleteDepositArgs): Promise<Deposit>
  getDeposit(caller: Caller, args: GetDepositArgs): Promise<Deposit | undefined>
  /** The caller's deposits, newest first. */
  listDeposits(caller: Caller, args: ListDepositsArgs): Promise<Deposit[]>
}

/** A 32-byte key as the ledger renders it, which the browser wallet reports in hex. */
const walletKeySchema = hexBytesSchema.pipe(z.string().length(64, 'expected a 32-byte key in hex'))

/** The browser wallet's keys: the call builder reads them for every circuit, and the complete circuit mints to the coin key. */
export const walletPublicKeysSchema = z.object({
  coinPublicKey: walletKeySchema,
  encryptionPublicKey: walletKeySchema,
})

export const startDepositArgsSchema = z.object({
  depositRequest: depositRequestSchema,
  wallet: walletPublicKeysSchema,
})
export type StartDepositArgs = z.infer<typeof startDepositArgsSchema>

export const completeDepositArgsSchema = z.object({
  name: depositNameSchema,
  wallet: walletPublicKeysSchema,
})
export type CompleteDepositArgs = z.infer<typeof completeDepositArgsSchema>

export const getDepositArgsSchema = z.object({
  name: depositNameSchema,
})
export type GetDepositArgs = z.infer<typeof getDepositArgsSchema>

export const listDepositsArgsSchema = z.object({})
export type ListDepositsArgs = z.infer<typeof listDepositsArgsSchema>
