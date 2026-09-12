import {
  MidnightNetwork,
  getSignetContractAddress,
  type DeployedNetwork,
} from '@sig-net/midnight';
import { getVaultContractAddress } from '@sig-net/midnight-examples-erc20-vault-contract';

import type { Env } from './vault';

export const midnightNetworkId =
  process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK_ID ?? MidnightNetwork.Undeployed;

const NETWORK_IDS: ReadonlySet<string> = new Set(
  Object.values(MidnightNetwork),
);

// A deployed network's contract addresses are published by the packages. A local undeployed
// stack deploys its own, so it supplies them through the override variables. Resolution is
// lazy (property getters below) so a misconfigured environment fails at connect time, with
// the variable named, and pages that never touch Midnight still load.
function contractAddress(
  override: string | undefined,
  overrideVar: string,
  published: (network: DeployedNetwork) => string,
): string {
  if (override) return override;
  if (!NETWORK_IDS.has(midnightNetworkId)) {
    throw new Error(
      `NEXT_PUBLIC_MIDNIGHT_NETWORK_ID "${midnightNetworkId}" is not one of ${[...NETWORK_IDS].join(', ')}`,
    );
  }
  if (midnightNetworkId === MidnightNetwork.Undeployed) {
    throw new Error(
      `${overrideVar} is required when NEXT_PUBLIC_MIDNIGHT_NETWORK_ID is ${MidnightNetwork.Undeployed}`,
    );
  }
  return published(midnightNetworkId as DeployedNetwork);
}

// The client polls the signet contract's response logs + the fakenet /responses API,
// and broadcasts the MPC-signed EVM tx to Sepolia itself.
export const midnightEnv: Env = {
  get contractAddress() {
    return contractAddress(
      process.env.NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS,
      'NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS',
      getVaultContractAddress,
    );
  },
  get signetContractAddress() {
    return contractAddress(
      process.env.NEXT_PUBLIC_MIDNIGHT_SIGNET_CONTRACT_ADDRESS,
      'NEXT_PUBLIC_MIDNIGHT_SIGNET_CONTRACT_ADDRESS',
      getSignetContractAddress,
    );
  },
  mpcSecpPub: process.env.NEXT_PUBLIC_MPC_SECP256K1_PUBKEY ?? '',
  evmRpcUrl: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? '',
  fakenetResponsesUrl:
    process.env.NEXT_PUBLIC_FAKENET_RESPONSES_URL ?? 'http://localhost:3040',
};

export function midnightIndexerConfig() {
  return {
    queryURL:
      process.env.NEXT_PUBLIC_MIDNIGHT_INDEXER_URL ??
      'http://127.0.0.1:8088/api/v3/graphql',
    subscriptionURL:
      process.env.NEXT_PUBLIC_MIDNIGHT_INDEXER_WS_URL ??
      'ws://127.0.0.1:8088/api/v3/graphql/ws',
  };
}
