import type { Hex } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { getFullEnv } from '@/lib/config/env.config';

let cachedEthAccount: PrivateKeyAccount | null = null;

function parseRelayerPrivateKey(): Uint8Array {
  const env = getFullEnv();
  return new Uint8Array(JSON.parse(env.RELAYER_PRIVATE_KEY));
}

export function getRelayerEthAccount(): PrivateKeyAccount {
  if (cachedEthAccount) return cachedEthAccount;

  const keypairBytes = parseRelayerPrivateKey();
  const ethPrivateKey =
    `0x${Buffer.from(keypairBytes.slice(0, 32)).toString('hex')}` as Hex;
  cachedEthAccount = privateKeyToAccount(ethPrivateKey);
  return cachedEthAccount;
}
