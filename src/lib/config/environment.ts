import { z } from 'zod'

export const environmentSchema = z.enum(['local', 'testnet', 'mainnet'])

export type Environment = z.infer<typeof environmentSchema>
