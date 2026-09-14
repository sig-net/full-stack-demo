import { type Address, getAddress } from "viem";

import { BrowserWallet, type BrowserWalletChoice } from "@/lib/evm/wallet/BrowserWallet";
import { SeedWallet } from "@/lib/evm/wallet/SeedWallet";
import type { WalletConnection } from "@/lib/evm/wallet/Wallet";
import { getEthereumProvider } from "@/lib/rpc";

import {
  type EvmChainConfig,
  getEvmChainConfig,
  requiresRpcChainVerification,
  resolveEvmChain,
} from "./evm";
import { isLoopbackEndpoint } from "./loopback-endpoint";
import type { NetworkId } from "./midnight";

/** Generated fork identity is captured independently of browser network selection. */
export interface LocalForkPolicy {
  readonly networkId: NetworkId;
  readonly markerAddress: string | undefined;
  readonly markerCode: string | undefined;
}
/**
 * @param networkId - Applied Midnight network captured with this connection.
 * @returns Immutable marker inputs owned by the generated local deployment.
 */
export function captureLocalForkPolicy(networkId: NetworkId): LocalForkPolicy {
  return Object.freeze({
    networkId,
    markerAddress: process.env.NEXT_PUBLIC_LOCAL_EVM_MARKER_ADDRESS,
    markerCode: process.env.NEXT_PUBLIC_LOCAL_EVM_MARKER_CODE,
  });
}
function localForkVerification(
  policy: LocalForkPolicy,
  config: EvmChainConfig,
  readCode: (address: Address) => Promise<string | undefined>,
): (() => Promise<void>) | undefined {
  const { rpcUrl } = config;
  const { networkId, markerAddress, markerCode } = policy;
  const local =
    networkId === "undeployed" && config.chainId === 11155111n && isLoopbackEndpoint(rpcUrl);
  if (!local) return undefined;
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
 * @param policy - Captured applied network and local marker inputs.
 * @returns A connection factory keyed by provider identity for duplicate-attempt exclusion.
 */
export function browserWalletConnection(
  choice: BrowserWalletChoice,
  config: EvmChainConfig = getEvmChainConfig(),
  policy = captureLocalForkPolicy("undeployed"),
): WalletConnection {
  return {
    key: choice.provider,
    create: (onInvalidated) => {
      const verifyNetwork = localForkVerification(policy, config, (address) =>
        choice.provider.request({
          method: "eth_getCode",
          params: [address, "latest"],
        }),
      );
      return new BrowserWallet(
        resolveEvmChain(config).chain,
        getEthereumProvider(config),
        choice,
        onInvalidated,
        verifyNetwork,
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
 * @param policy - Captured applied network and local marker inputs.
 * @returns A connection factory with an identity distinct from other seed attempts.
 */
export function seedWalletConnection(
  input: string,
  config: EvmChainConfig = getEvmChainConfig(),
  policy = captureLocalForkPolicy("undeployed"),
): WalletConnection {
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
        localForkVerification(policy, config, (address) => publicClient.getCode({ address })),
        requiresRpcChainVerification(config),
      );
      seed = "";
      return wallet;
    },
  };
}
