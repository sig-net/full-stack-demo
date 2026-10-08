import { z } from 'zod'

import { CALLER_COLLECTION } from '@/lib/caller/caller'
import { amountSchema, evmAddressSchema, HEX_32_BYTES, UUID } from '@/lib/value-schemas'

/** The collection segment of a deposit's resource name. */
export const DEPOSIT_COLLECTION = 'erc20-vault-deposits'

/** `callers/{caller}/erc20-vault-deposits/{deposit}`, where the deposit is a UUID. */
export const depositNameSchema = z
  .string()
  .regex(
    new RegExp(`^${CALLER_COLLECTION}/${HEX_32_BYTES}/${DEPOSIT_COLLECTION}/${UUID}$`),
    `expected callers/{caller}/${DEPOSIT_COLLECTION}/{uuid}`,
  )

export const depositStateSchema = z.enum([
  // RequestStartDeposit
  'Pending Start Proving',

  // SubmitStartDeposit
  'Pending Start Signing & Balancing',

  'Start Submission in Progress',
  'Awaiting Flushing',
  'Awaiting Sending',
  'Awaiting EVM Signature',
  'Awaiting EVM Submission',
  'Awaiting Attestation',
  'Attestation Queing in Progress',
  'Awaiting Attestation Flushing',
  'Pending Complete Deposit Proving',
  'Pending Complete Deposit Signing & Balancing',
])

export type DepositState = z.infer<typeof depositStateSchema>

/** The deposit resource. `name` is assigned by the server. */
export const depositSchema = z.object({
  name: depositNameSchema,
  erc20Address: evmAddressSchema,
  amount: amountSchema,
  state: depositStateSchema,

  startDepositMidnightTxn: z.unknown(),
  depositEVMTxn: z.unknown(),
  completeDepositMidnightTxn: z.unknown(),
})

export type Deposit = z.infer<typeof depositSchema>

export function depositName(parent: string, id: string): string {
  return `${parent}/${DEPOSIT_COLLECTION}/${id}`
}
