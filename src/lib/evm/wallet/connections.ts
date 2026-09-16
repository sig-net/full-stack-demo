import {
  type EvmChainConfig,
  requiresRpcChainVerification,
  resolveEvmChain,
} from "@/lib/config/runtime";
import { getEthereumProvider } from "@/lib/rpc";

import { BrowserWallet, type BrowserWalletChoice } from "./BrowserWallet";
import { SeedWallet } from "./SeedWallet";
import type { WalletConnection } from "./Wallet";

/**
 * Captures the selected browser provider and the app's local-fork verification policy.
 *
 * @param choice - The discovered extension provider selected by the user.
 * @param config - Public configuration captured for this connection attempt.
 * @returns A connection factory keyed by provider identity for duplicate-attempt exclusion.
 */
export function browserWalletConnection(
  choice: BrowserWalletChoice,
  config: EvmChainConfig,
): WalletConnection {
  return {
    key: choice.provider,
    create: (onInvalidated) => {
      return new BrowserWallet(
        resolveEvmChain(config).chain,
        getEthereumProvider(config),
        choice,
        onInvalidated,
        undefined,
        config.explorerUrl,
        requiresRpcChainVerification(config),
      );
    },
  };
}

/**
 * Transfers the supplied seed to a wallet and releases the factory's reference after construction.
 *
 * @param input - The user-supplied seed held in page memory.
 * @param config - Public configuration captured for this connection attempt.
 * @returns A connection factory with an identity distinct from other seed attempts.
 */
export function seedWalletConnection(input: string, config: EvmChainConfig): WalletConnection {
  let seed = input;
  return {
    key: {},
    create: () => {
      const publicClient = getEthereumProvider(config);
      const wallet = new SeedWallet(
        resolveEvmChain(config).chain,
        publicClient,
        config.rpcUrl,
        seed,
        config.explorerUrl,
        undefined,
        requiresRpcChainVerification(config),
      );
      seed = "";
      return wallet;
    },
  };
}
