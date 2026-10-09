import { z } from 'zod'

import { CALLER_COLLECTION } from '@/lib/caller/caller'
import { HEX_32_BYTES, UUID } from '@/lib/value-schemas'

/** The collection segment of an Ethereum transaction's resource name. */
export const ETHEREUM_TRANSACTION_COLLECTION = 'ethereum-transactions'

/** `callers/{caller}/ethereum-transactions/{transaction}`, where the transaction is a UUID. */
export const ethereumTransactionNameSchema = z
  .string()
  .regex(
    new RegExp(`^${CALLER_COLLECTION}/${HEX_32_BYTES}/${ETHEREUM_TRANSACTION_COLLECTION}/${UUID}$`),
    `expected callers/{caller}/${ETHEREUM_TRANSACTION_COLLECTION}/{uuid}`,
  )

/** Each state names what the transaction waits for, so it is a to-do for exactly one actor. */
export const ETHEREUM_TRANSACTION_STATES = [
  'AwaitingSubmission',
  'AwaitingInclusion',
  'Succeeded',
  'Failed',
] as const

export const ethereumTransactionStateSchema = z.enum(ETHEREUM_TRANSACTION_STATES)

export type EthereumTransactionState = z.infer<typeof ethereumTransactionStateSchema>

/** The states a transaction never leaves. */
export const ETHEREUM_TRANSACTION_TERMINAL_STATES = [
  'Succeeded',
  'Failed',
] as const satisfies readonly EthereumTransactionState[]

/**
 * Why a transaction failed. `Rejected` and `NonceConsumed` can never be on chain, `Reverted` is
 * on chain with its gas paid and its call not applied, and `Expired` is the backend giving up on
 * a transaction the chain may still include.
 */
export const ETHEREUM_TRANSACTION_FAILURES = [
  'Rejected',
  'Reverted',
  'NonceConsumed',
  'Expired',
] as const

export const ethereumTransactionFailureSchema = z.enum(ETHEREUM_TRANSACTION_FAILURES)

export type EthereumTransactionFailure = z.infer<typeof ethereumTransactionFailureSchema>

/** Bytes as ethers serialises them: `0x` followed by lower-case hex. */
const EVM_BYTES = /^0x(?:[0-9a-f]{2})+$/

/** A 32-byte hash as ethers returns it: `0x` followed by 64 lower-case hex digits. */
const EVM_HASH = /^0x[0-9a-f]{64}$/

/**
 * One attempt to put one signed transaction on the EVM chain. The bytes arrive signed (by the
 * MPC, for a vault request), so the row holds them and what the chain returned for them. A
 * resource that needs a transaction on chain owns a sequence of these, at most one of them live.
 */
export const ethereumTransactionSchema = z.object({
  name: ethereumTransactionNameSchema,
  /** The name of the resource the transaction serves. */
  parent: z.string().min(1),
  state: ethereumTransactionStateSchema,
  /** The signed transaction, what the RPC node receives. */
  signedTx: z.string().regex(EVM_BYTES, 'expected 0x-prefixed lower-case hex'),
  /** The hash the node accepted the bytes under, what the receipt is watched by. */
  txHash: z.string().regex(EVM_HASH, 'expected a 32-byte hash in 0x-prefixed hex').nullable(),
  /** The block that included the transaction, set with `Succeeded` and with a `Reverted` failure. */
  blockNumber: z.bigint().nonnegative().nullable(),
  /** The time after which the backend stops waiting, though the chain may still include the transaction. */
  expireTime: z.date().nullable(),
  /** Set with `Failed`. */
  failure: ethereumTransactionFailureSchema.nullable(),
  /** The node's message behind a failure, where there was one. */
  error: z.string().nullable(),
  createTime: z.date(),
  updateTime: z.date(),
})

export type EthereumTransaction = z.infer<typeof ethereumTransactionSchema>

export function ethereumTransactionName(parent: string, id: string): string {
  return `${parent}/${ETHEREUM_TRANSACTION_COLLECTION}/${id}`
}
