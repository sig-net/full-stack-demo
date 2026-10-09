import { z } from 'zod'

import { CALLER_COLLECTION } from '@/lib/caller/caller'
import { HEX_32_BYTES, UUID } from '@/lib/value-schemas'

/** The collection segment of a Midnight transaction's resource name. */
export const MIDNIGHT_TRANSACTION_COLLECTION = 'midnight-transactions'

/** `callers/{caller}/midnight-transactions/{transaction}`, where the transaction is a UUID. */
export const midnightTransactionNameSchema = z
  .string()
  .regex(
    new RegExp(`^${CALLER_COLLECTION}/${HEX_32_BYTES}/${MIDNIGHT_TRANSACTION_COLLECTION}/${UUID}$`),
    `expected callers/{caller}/${MIDNIGHT_TRANSACTION_COLLECTION}/{uuid}`,
  )

/** Each state names what the transaction waits for, so it is a to-do for exactly one actor. */
export const MIDNIGHT_TRANSACTION_STATES = [
  'AwaitingProof',
  'AwaitingWallet',
  'AwaitingSubmission',
  'AwaitingInclusion',
  'Succeeded',
  'Failed',
] as const

export const midnightTransactionStateSchema = z.enum(MIDNIGHT_TRANSACTION_STATES)

export type MidnightTransactionState = z.infer<typeof midnightTransactionStateSchema>

/** The states a transaction never leaves. */
export const MIDNIGHT_TRANSACTION_TERMINAL_STATES = [
  'Succeeded',
  'Failed',
] as const satisfies readonly MidnightTransactionState[]

/**
 * Why a transaction failed. `ProofFailed`, `Rejected`, `FailEntirely` and `Expired` left nothing
 * on chain and paid no fee; `FailFallible` is on chain with its fee paid and its call not applied.
 */
export const MIDNIGHT_TRANSACTION_FAILURES = [
  'ProofFailed',
  'Rejected',
  'FailEntirely',
  'FailFallible',
  'Expired',
] as const

export const midnightTransactionFailureSchema = z.enum(MIDNIGHT_TRANSACTION_FAILURES)

export type MidnightTransactionFailure = z.infer<typeof midnightTransactionFailureSchema>

/**
 * Whose wallet balances, signs and pays: the caller's browser wallet, or the backend's relayer
 * wallet for a permissionless circuit. `AwaitingWallet` is that wallet's to-do.
 */
export const MIDNIGHT_TRANSACTION_SIGNERS = ['caller', 'relayer'] as const

export const midnightTransactionSignerSchema = z.enum(MIDNIGHT_TRANSACTION_SIGNERS)

export type MidnightTransactionSigner = z.infer<typeof midnightTransactionSignerSchema>

/**
 * One attempt to put one circuit call on the Midnight chain through the signer's wallet. A
 * resource that needs a call on chain owns a sequence of these, at most one of them live. The
 * transaction bytes are hex in the ledger's serialisation, each null until the step that
 * produces it has run.
 */
export const midnightTransactionSchema = z.object({
  name: midnightTransactionNameSchema,
  /** The name of the resource the transaction serves. */
  parent: z.string().min(1),
  state: midnightTransactionStateSchema,
  /** The circuit the transaction calls, as the contract names it. */
  circuit: z.string().min(1),
  signer: midnightTransactionSignerSchema,
  /** Built with the witness values and embedding the private transcript, null once proven. */
  unprovenTx: z.string().nullable(),
  /** Proven and unbalanced, what the wallet balances and signs. */
  unboundTx: z.string().nullable(),
  /** Balanced and signed by the wallet, what the node receives. */
  finalizedTx: z.string().nullable(),
  /** The intent's TTL, after which the node rejects the transaction. */
  expireTime: z.date().nullable(),
  /** The id the node returned on acceptance, what the indexer is watched by. */
  txId: z.string().nullable(),
  /** Set with `Failed`. */
  failure: midnightTransactionFailureSchema.nullable(),
  /** The external system's message behind a failure, where there was one. */
  error: z.string().nullable(),
  createTime: z.date(),
  updateTime: z.date(),
})

export type MidnightTransaction = z.infer<typeof midnightTransactionSchema>

export function midnightTransactionName(parent: string, id: string): string {
  return `${parent}/${MIDNIGHT_TRANSACTION_COLLECTION}/${id}`
}
