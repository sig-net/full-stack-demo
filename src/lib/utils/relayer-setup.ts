import type { Hex } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { getFullEnv } from '@/lib/config/env.config';

let cachedEthAccount: PrivateKeyAccount | null = null;

export function getRelayerEthAccount(): PrivateKeyAccount {
  if (cachedEthAccount) return cachedEthAccount;

  cachedEthAccount = privateKeyToAccount(
    getFullEnv().RELAYER_PRIVATE_KEY as Hex,
  );
  return cachedEthAccount;
}
