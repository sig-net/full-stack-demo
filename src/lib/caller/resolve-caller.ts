import 'server-only'

import { addressFromKey } from '@midnightntwrk/ledger-v9'
import { MidnightBech32m, UnshieldedAddress } from '@midnightntwrk/wallet-sdk-address-format'

import { type Caller, callerName } from '@/lib/caller/caller'
import {
  LOGIN_CLOCK_SKEW_MS,
  LOGIN_WINDOW_MS,
  loginCredentialSchema,
  loginMessageOf,
} from '@/lib/caller/login-credential'
import type { MidnightNetworkId } from '@/lib/config/midnight-network-config'
import { SIGNATURE_KIND_BY_SCHEME, verifyMessageSignature } from '@/lib/midnight/signed-message'

/**
 * Verifies the login credential a server action received and names the caller after the key
 * that signed it, so every caller holds the unshielded key its resources are named after. The
 * message is rebuilt here from the application's network and the credential's `issuedAt`, and
 * a credential older than `LOGIN_WINDOW_MS`, or dated more than `LOGIN_CLOCK_SKEW_MS` ahead of
 * the server's clock, is refused whatever it signs.
 *
 * @throws {Error} When the credential is malformed, outside its window, or not a signature of this network's login message.
 */
export function resolveCaller(
  credential: unknown,
  networkId: MidnightNetworkId,
  now: Date = new Date(),
): Caller {
  const parsed = loginCredentialSchema.safeParse(credential)
  if (!parsed.success) {
    throw new Error('The caller credential must be a wallet login signature.')
  }
  const { issuedAt, signature } = parsed.data
  const age = now.getTime() - Date.parse(issuedAt)
  if (age < -LOGIN_CLOCK_SKEW_MS) throw new Error('The login is dated in the future.')
  if (age > LOGIN_WINDOW_MS) throw new Error('The login has expired: sign in again.')
  const message = new TextEncoder().encode(loginMessageOf(networkId, issuedAt))
  if (!verifyMessageSignature(signature, message)) {
    throw new Error(`The login signature does not verify for ${networkId}.`)
  }
  const callerId = addressFromKey({
    tag: SIGNATURE_KIND_BY_SCHEME[signature.scheme],
    value: signature.verifyingKey,
  })
  return {
    unshieldedAddress: MidnightBech32m.encode(
      networkId,
      new UnshieldedAddress(Buffer.from(callerId, 'hex')),
    ).toString(),
    name: callerName(callerId),
  }
}
