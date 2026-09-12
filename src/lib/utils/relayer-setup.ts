import type { Hex } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { getRelayerPrivateKey } from '@/lib/config/relayer';

let cachedEthAccount: PrivateKeyAccount | null = null;

export function getRelayerEthAccount(): PrivateKeyAccount {
  if (cachedEthAccount) return cachedEthAccount;

  cachedEthAccount = privateKeyToAccount(
    getRelayerPrivateKey() as Hex,
  );
  return cachedEthAccount;
}
