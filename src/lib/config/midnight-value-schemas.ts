import {
  contractAddressFromHex,
  normaliseSecp256k1PublicKey,
  stripHexPrefix,
} from '@sig-net/midnight'
import { z } from 'zod'

function issue(context: z.RefinementCtx, error: unknown, fallback: string): typeof z.NEVER {
  context.addIssue({ code: 'custom', message: error instanceof Error ? error.message : fallback })
  return z.NEVER
}

/** A 32-byte Midnight contract address in hex, stored without the `0x` prefix in lower case. */
export const midnightContractAddressSchema = z.string().transform((value, context) => {
  try {
    contractAddressFromHex(value)
  } catch (error) {
    return issue(context, error, 'invalid contract address')
  }
  return stripHexPrefix(value).toLowerCase()
})

/** A secp256k1 public key in any published spelling, stored as `0x04…` uncompressed SEC1 hex. */
export const secp256k1PublicKeySchema = z.string().transform((value, context) => {
  try {
    return normaliseSecp256k1PublicKey(value)
  } catch (error) {
    return issue(context, error, 'invalid secp256k1 public key')
  }
})
