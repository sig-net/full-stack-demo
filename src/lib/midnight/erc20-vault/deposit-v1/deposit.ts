import { z } from 'zod'

import { CALLER_COLLECTION } from '@/lib/caller/caller'
import {
  amountSchema,
  evmAddressSchema,
  HEX_32_BYTES,
  uint64Schema,
  uint128Schema,
  UUID,
} from '@/lib/value-schemas'

/** The collection segment of a deposit's resource name. */
export const DEPOSIT_COLLECTION = 'erc20-vault-deposits'

/** `callers/{caller}/erc20-vault-deposits/{deposit}`, where the deposit is a UUID. */
export const depositNameSchema = z
  .string()
  .regex(
    new RegExp(`^${CALLER_COLLECTION}/${HEX_32_BYTES}/${DEPOSIT_COLLECTION}/${UUID}$`),
    `expected callers/{caller}/${DEPOSIT_COLLECTION}/{uuid}`,
  )

export const DEPOSIT_STATES = ['Starting'] as const

export const depositStateSchema = z.enum(DEPOSIT_STATES)

export type DepositState = z.infer<typeof depositStateSchema>

/**
 * The deposit resource. The caller supplies the request (`erc20Address`, `amount`), the server
 * assigns everything else before the `startDeposit` circuit is built. The transactions behind its
 * steps name it as their parent, so its attempts are found through the transaction repositories.
 */
export const depositSchema = z.object({
  name: depositNameSchema,
  erc20Address: evmAddressSchema,
  amount: amountSchema,
  state: depositStateSchema,
  /** The circuit's `inIndex`: the request's slot in the vault's buffers, chosen at random. */
  inIndex: uint64Schema,
  /** The nonce of the EVM account that signs the deposit, read from the EVM RPC. */
  evmNonce: uint64Schema,
  /** The circuit's `GasParams` for the EVM transaction, read from the EVM RPC. */
  gasLimit: uint64Schema,
  maxFeePerGas: uint128Schema,
  maxPriorityFeePerGas: uint128Schema,
})

export type Deposit = z.infer<typeof depositSchema>

/** What the caller supplies to start a deposit, the circuit's `DepositRequest`. */
export const depositRequestSchema = depositSchema.pick({ erc20Address: true, amount: true })

export type DepositRequest = z.infer<typeof depositRequestSchema>

export function depositName(parent: string, id: string): string {
  return `${parent}/${DEPOSIT_COLLECTION}/${id}`
}
