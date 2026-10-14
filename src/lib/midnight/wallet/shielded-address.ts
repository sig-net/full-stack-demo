import {
  MidnightBech32m,
  ShieldedAddress,
  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
} from '@midnightntwrk/wallet-sdk-address-format'

import type { MidnightNetworkId } from '@/lib/config/midnight-network-config'
import type { WalletPublicKeys } from '@/lib/midnight/wallet/wallet'

/** The bech32m shielded address of a wallet's keys on the network, such as `mn_shield-addr_undeployed1…`. */
export function shieldedAddressOf(keys: WalletPublicKeys, networkId: MidnightNetworkId): string {
  return MidnightBech32m.encode(
    networkId,
    new ShieldedAddress(
      ShieldedCoinPublicKey.fromHexString(keys.coinPublicKey),
      ShieldedEncryptionPublicKey.fromHexString(keys.encryptionPublicKey),
    ),
  ).toString()
}
