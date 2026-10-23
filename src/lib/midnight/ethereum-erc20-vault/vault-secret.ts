import { bytesToHex, hexToBytes } from '@sig-net/midnight'
import { pureCircuits } from '@sig-net/midnight-examples-erc20-vault-contract'
import { z } from 'zod'

import { hexBytesSchema } from '@/lib/value-schemas'

/**
 * The 32-byte vault secret in hex, the value of the contract's `callerSecretKey` witness, which
 * the browser holds and every caller circuit is built with. Stored without the `0x` prefix in
 * lower case. It never reaches the server: the server receives its commitment instead.
 */
export const vaultSecretSchema = z
  .string()
  .regex(/^(?:0x)?[0-9a-fA-F]{64}$/, 'expected 32 bytes in hex')
  .transform((value) => value.replace(/^0x/i, '').toLowerCase())

/** A fresh random vault secret in hex. */
export function generateVaultSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * The contract's commitment of the vault secret in lower-case hex, which the start circuit
 * records as a request's path and the deposit account is derived over.
 */
export function userCommitmentOf(vaultSecret: string): string {
  return bytesToHex(pureCircuits.userCommitment(hexToBytes(vaultSecret)))
}

/** A user commitment as the browser sends it, 32 bytes in hex. */
export const userCommitmentSchema = hexBytesSchema.pipe(
  z.string().length(64, 'expected a 32-byte commitment in hex'),
)
