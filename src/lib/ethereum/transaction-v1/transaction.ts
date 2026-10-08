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

export const ETHEREUM_TRANSACTION_STATES = [
  'Signing',
  'Submitting',
  'Pending',
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
 * One attempt to put one transaction on the EVM chain through the caller's wallet. A resource
 * that needs a transaction on chain owns a sequence of these, at most one of them live. The
 * transaction bytes are hex, each null until the step that produces it has run.
 */
export const ethereumTransactionSchema = z.object({
  name: ethereumTransactionNameSchema,
  /** The name of the resource the transaction serves. */
  parent: z.string().min(1),
  state: ethereumTransactionStateSchema,
  /** The serialised transaction request the wallet signs. */
  unsignedTx: z.string().nullable(),
  /** Signed by the wallet, what the RPC node receives. */
  signedTx: z.string().nullable(),
  /** The hash the node returned on acceptance, what the receipt is watched by. */
  txHash: z.string().nullable(),
  /** Set with `Failed`. */
  error: z.string().nullable(),
  createTime: z.date(),
  updateTime: z.date(),
})

export type EthereumTransaction = z.infer<typeof ethereumTransactionSchema>

export function ethereumTransactionName(parent: string, id: string): string {
  return `${parent}/${ETHEREUM_TRANSACTION_COLLECTION}/${id}`
}
