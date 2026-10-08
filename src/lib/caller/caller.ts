import { z } from 'zod'

import { HEX_32_BYTES } from '@/lib/value-schemas'

/** The authenticated caller of a service method, resolved on the server from the caller secret. */
export interface Caller {
  /** The 32-byte vault identity secret, the value of the `callerSecretKey` witness. Never logged. */
  readonly secretKey: Uint8Array
  /**
   * `callers/{caller}`, the parent of every resource the caller owns. The caller id is SHA-256 of
   * the secret under the application's domain tag, in hex, so it depends only on the application.
   */
  readonly name: string
}

export const CALLER_COLLECTION = 'callers'

/** `callers/{caller}`, where the caller is the application's caller id in hex. */
export const callerNameSchema = z
  .string()
  .regex(
    new RegExp(`^${CALLER_COLLECTION}/${HEX_32_BYTES}$`),
    'expected callers/{64 hex characters}',
  )

export function callerName(callerId: string): string {
  return `${CALLER_COLLECTION}/${callerId}`
}

/** True when the resource is the caller itself or lives under it. */
export function resourceOwnedByCaller(resourceName: string, caller: Caller): boolean {
  return resourceName === caller.name || resourceName.startsWith(`${caller.name}/`)
}

/**
 * The caller's 32-byte vault identity secret in hex, the value of the contract's
 * `callerSecretKey` witness. Stored without the `0x` prefix in lower case.
 */
export const callerSecretSchema = z
  .string()
  .regex(/^(?:0x)?[0-9a-fA-F]{64}$/, 'expected 32 bytes in hex')
  .transform((value) => value.replace(/^0x/i, '').toLowerCase())

/** A fresh random caller secret in hex. */
export function generateCallerSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
