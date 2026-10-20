import { circuitAssertMessage } from '@/lib/midnight/ethereum-erc20-vault/vault-call'

/** The step a caller call is at in the page, reported as each begins. */
export type CallerCallStage = 'preparing' | 'building' | 'signing' | 'recording'

/** A contract assert firing while the call is built is the vault refusing `operation`, the noun the page uses for it. */
export async function vaultRefusalOf(
  building: Promise<string>,
  operation: string,
): Promise<string> {
  try {
    return await building
  } catch (error: unknown) {
    const refusal = circuitAssertMessage(error)
    if (refusal === undefined) throw error
    throw new Error(`the vault refused the ${operation}: ${refusal}`, { cause: error })
  }
}
