import { z } from 'zod'

import type { MidnightNetworkId } from '@/lib/config/midnight-network-config'
import { messageSignatureSchema } from '@/lib/midnight/signed-message'

/**
 * The credential every server action takes first: the connected wallet's signature over the
 * login message of `issuedAt`, which names the caller after the key that signed. The server
 * rebuilds the message from its own network and `issuedAt`, so a signature over anything else
 * fails, and refuses a credential older than `LOGIN_WINDOW_MS`, so a captured one expires.
 */
export const loginCredentialSchema = z.object({
  /** When the message was signed, in ISO 8601 UTC, spelled exactly as it was written into the message. */
  issuedAt: z.iso.datetime(),
  signature: messageSignatureSchema,
})

export type LoginCredential = z.infer<typeof loginCredentialSchema>

/** The text the wallet signs, bound to this application, the network and the moment, which the connector encodes as UTF-8. */
export function loginMessageOf(networkId: MidnightNetworkId, issuedAt: string): string {
  return `full-stack-demo:login:${networkId}:${issuedAt}`
}

export const LOGIN_WINDOW_MS = 5 * 60 * 1000

/** How far ahead of the server's clock an `issuedAt` may be, for a browser whose clock runs ahead. */
export const LOGIN_CLOCK_SKEW_MS = 60 * 1000
