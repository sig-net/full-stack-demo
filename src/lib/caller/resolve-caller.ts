import 'server-only'

import { MidnightBech32m, UnshieldedAddress } from '@midnightntwrk/wallet-sdk-address-format'

import { type Caller, callerName } from '@/lib/caller/caller'
import type { MidnightNetworkId } from '@/lib/config/midnight-network-config'
import { unshieldedAddressSchema } from '@/lib/value-schemas'

/**
 * Validates the unshielded address a server action received, on the application's network, and
 * names the caller after the user address it encodes.
 *
 * @throws {Error} When the value is not an unshielded address of `networkId`.
 */
export function resolveCaller(callerAddress: unknown, networkId: MidnightNetworkId): Caller {
  const parsed = unshieldedAddressSchema.safeParse(callerAddress)
  if (!parsed.success) {
    throw new Error('The caller address must be an unshielded Midnight address.')
  }
  let decoded: UnshieldedAddress
  try {
    decoded = MidnightBech32m.parse(parsed.data).decode(UnshieldedAddress, networkId)
  } catch (error: unknown) {
    throw new Error(`The caller address must be an unshielded address of ${networkId}.`, {
      cause: error,
    })
  }
  return { unshieldedAddress: parsed.data, name: callerName(decoded.hexString) }
}
