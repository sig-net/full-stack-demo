import { secp256k1 } from "@noble/curves/secp256k1";
import { type DeployedNetwork, getSignetContractAddress, MidnightNetwork } from "@sig-net/midnight";
import { getVaultContractAddress } from "@sig-net/midnight-examples-erc20-vault-contract";
import { z } from "zod";

import type { EvmChainConfig } from "../config/evm";
import type { MidnightNodeConfig } from "../config/midnight";
import type { Env } from "./vault";

function contractAddress(
  networkId: MidnightNodeConfig["networkId"],
  override: string | undefined,
  overrideVar: string,
  published: (network: DeployedNetwork) => string,
): string {
  if (override !== undefined) {
    if (!/^(?:0x)?[0-9a-fA-F]{64}$/.test(override))
      throw new Error(`${overrideVar} must be a 32-byte hex contract address`);
    return override.replace(/^0x/, "");
  }
  const network = z.enum(MidnightNetwork).parse(networkId);
  if (network === MidnightNetwork.Undeployed) {
    throw new Error(
      `${overrideVar} is required when NEXT_PUBLIC_MIDNIGHT_NETWORK_ID is ${MidnightNetwork.Undeployed}`,
    );
  }
  try {
    return published(network);
  } catch (cause) {
    throw new Error(`No published deployment for ${networkId}. Set ${overrideVar}`, { cause });
  }
}

/**
 * Captures deployment inputs while resolving contract identities lazily for wallet-only startup.
 *
 * @param midnightConfig - Network used for published address lookup.
 * @param evmConfig - RPC captured for vault EVM operations.
 * @param input - Explicit deployment overrides, defaulting to the public environment.
 * @param input.contractAddress - Vault deployment override.
 * @param input.signetContractAddress - Signet deployment override.
 * @param input.mpcSecpPub - MPC secp256k1 public key paired with that deployment.
 * @returns A lazy environment whose identity getters validate when read.
 */
export function createVaultEnvironment(
  midnightConfig: MidnightNodeConfig,
  evmConfig: EvmChainConfig,
  input = {
    contractAddress: process.env.NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS,
    signetContractAddress: process.env.NEXT_PUBLIC_MIDNIGHT_SIGNET_CONTRACT_ADDRESS,
    mpcSecpPub: process.env.NEXT_PUBLIC_MPC_SECP256K1_PUBKEY,
  },
): Env {
  const { networkId } = midnightConfig;
  const {
    contractAddress: vaultOverride,
    signetContractAddress: signetOverride,
    mpcSecpPub,
  } = input;
  return Object.freeze({
    get contractAddress(): string {
      return contractAddress(
        networkId,
        vaultOverride,
        "NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS",
        getVaultContractAddress,
      );
    },
    get signetContractAddress(): string {
      return contractAddress(
        networkId,
        signetOverride,
        "NEXT_PUBLIC_MIDNIGHT_SIGNET_CONTRACT_ADDRESS",
        getSignetContractAddress,
      );
    },
    get mpcSecpPub(): string {
      try {
        if (!mpcSecpPub?.startsWith("0x")) throw new Error("Missing hex prefix");
        secp256k1.Point.fromHex(mpcSecpPub.slice(2)).assertValidity();
      } catch (cause) {
        throw new Error(
          "NEXT_PUBLIC_MPC_SECP256K1_PUBKEY must be a 0x-prefixed secp256k1 public key",
          { cause },
        );
      }
      return mpcSecpPub;
    },
    evmRpcUrl: evmConfig.rpcUrl,
  });
}
