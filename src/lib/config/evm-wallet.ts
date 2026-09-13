import { type Address, getAddress } from "viem";

import { BrowserWallet, type BrowserWalletChoice } from "@/lib/evm/wallet/BrowserWallet";
import { SeedWallet } from "@/lib/evm/wallet/SeedWallet";
import type { WalletConnection } from "@/lib/evm/wallet/Wallet";
import { getEthereumProvider } from "@/lib/rpc";

import { type EvmChainConfig, getEvmChainConfig, sepolia } from "./evm";

function localForkVerification(
  rpcUrl: string,
  readCode: (address: Address) => Promise<string | undefined>,
): (() => Promise<void>) | undefined {
  const local = (process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK_ID ?? "undeployed") === "undeployed";
  if (!local) return undefined;
  const markerAddress = process.env.NEXT_PUBLIC_LOCAL_EVM_MARKER_ADDRESS;
  const markerCode = process.env.NEXT_PUBLIC_LOCAL_EVM_MARKER_CODE;
  return async () => {
    if (!markerAddress || !markerCode)
      throw new Error("Run local setup and restart the app to configure the local fork.");
    const observed = await readCode(getAddress(markerAddress));
    if (observed?.toLowerCase() !== markerCode.toLowerCase())
      throw new Error(
        `Use the current local Sepolia RPC ${rpcUrl}, then reconnect. The local fork marker does not match.`,
      );
  };
}

/**
 * Captures the selected browser provider and the app's local-fork verification policy.
 *
 * @param choice - The discovered extension provider selected by the user.
 * @param config - Public configuration captured for this connection attempt.
 * @returns A connection factory keyed by provider identity for duplicate-attempt exclusion.
 */
export function browserWalletConnection(
  choice: BrowserWalletChoice,
  config: EvmChainConfig = getEvmChainConfig(),
): WalletConnection {
  return {
    key: choice.provider,
    create: (onInvalidated) => {
      const verifyNetwork = localForkVerification(config.rpcUrl, (address) =>
        choice.provider.request({
          method: "eth_getCode",
          params: [address, "latest"],
        }),
      );
      return new BrowserWallet(
        sepolia,
        getEthereumProvider(config),
        choice,
        onInvalidated,
        verifyNetwork,
        config.explorerUrl,
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
export function seedWalletConnection(
  input: string,
  config: EvmChainConfig = getEvmChainConfig(),
): WalletConnection {
  let seed = input;
  return {
    key: {},
    create: () => {
      const publicClient = getEthereumProvider(config);
      const wallet = new SeedWallet(
        sepolia,
        publicClient,
        config.rpcUrl,
        seed,
        config.explorerUrl,
        localForkVerification(config.rpcUrl, (address) => publicClient.getCode({ address })),
      );
      seed = "";
      return wallet;
    },
  };
}
