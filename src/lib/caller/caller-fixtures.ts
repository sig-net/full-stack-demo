import { MidnightBech32m, UnshieldedAddress } from '@midnightntwrk/wallet-sdk-address-format'
import { MidnightNetwork } from '@sig-net/midnight'

import type { Caller } from '@/lib/caller/caller'
import type { MidnightNetworkId } from '@/lib/config/midnight-network-config'

/** The network every fixture address is encoded for. */
export const FIXTURE_NETWORK_ID: MidnightNetworkId = MidnightNetwork.Stagenet

export const CALLER_ID = 'ab'.repeat(32)
export const CALLER_ADDRESS = unshieldedAddressOf(CALLER_ID)
export const CALLER_NAME = `callers/${CALLER_ID}`
export const CALLER: Caller = { unshieldedAddress: CALLER_ADDRESS, name: CALLER_NAME }

const STRANGER_ID = 'cd'.repeat(32)
const STRANGER_ADDRESS = unshieldedAddressOf(STRANGER_ID)
export const STRANGER: Caller = {
  unshieldedAddress: STRANGER_ADDRESS,
  name: `callers/${STRANGER_ID}`,
}

/** The Bech32m unshielded address of a 32-byte user address in hex, on the fixture network. */
function unshieldedAddressOf(userAddressHex: string): string {
  return MidnightBech32m.encode(
    FIXTURE_NETWORK_ID,
    new UnshieldedAddress(Buffer.from(userAddressHex, 'hex')),
  ).toString()
}
