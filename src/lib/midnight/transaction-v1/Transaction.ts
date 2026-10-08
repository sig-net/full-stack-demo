import { z } from 'zod'

export const transactionStateSchema = z.enum([
  'Proving',
  'Signing & Balancing',
  'Pending',
  'Submitting',
  'Failed',
])

export type TransactionState = z.infer<typeof transactionStateSchema>

export const transactionSchema = z.object({
  state: transactionStateSchema,
  data: z.string(),
})
