import type { Hex } from "viem";
import { type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";

import { getRelayerPrivateKey } from "@/lib/config/relayer";

let cachedEthAccount: PrivateKeyAccount | null = null;

/**
 * Retains one server signing account for repeated relayer operations within this module instance.
 *
 * @returns The operator account captured on the first successful invocation.
 * @throws {Error} If credential validation or account construction fails on first invocation.
 */
export function getRelayerEthAccount(): PrivateKeyAccount {
  if (cachedEthAccount) return cachedEthAccount;

  cachedEthAccount = privateKeyToAccount(getRelayerPrivateKey() as Hex);
  return cachedEthAccount;
}
