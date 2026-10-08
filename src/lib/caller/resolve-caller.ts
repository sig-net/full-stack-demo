import 'server-only'

import { createHash } from 'node:crypto'

import { type Caller, callerName, callerSecretSchema } from '@/lib/caller/caller'

/**
 * Validates the caller secret a server action received and derives the caller name from it.
 *
 * @throws {Error} When the secret is not 32 bytes in hex.
 */
export function resolveCaller(callerSecret: unknown): Caller {
  const parsed = callerSecretSchema.safeParse(callerSecret)
  if (!parsed.success) {
    throw new Error('The caller secret must be 32 bytes in hex.')
  }
  const secretKey = Uint8Array.from(Buffer.from(parsed.data, 'hex'))
  return { secretKey, name: callerName(callerIdOf(secretKey)) }
}

/** Changing this tag renames every caller, and with it every stored resource name. */
const CALLER_ID_DOMAIN_TAG = 'full-stack-demo:caller:'

/** SHA-256 of the domain tag and the secret, in hex. */
export function callerIdOf(secretKey: Uint8Array): string {
  return createHash('sha256').update(CALLER_ID_DOMAIN_TAG).update(secretKey).digest('hex')
}
