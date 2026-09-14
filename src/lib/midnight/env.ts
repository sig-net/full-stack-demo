import type { EvmChainConfig } from "../config/evm";
import type { MidnightNodeConfig } from "../config/midnight";
import {
  getRuntimeDefaults,
  resolveVaultConfiguration,
  validateRuntimeConfig,
} from "../config/runtime";
import type { Env } from "./vault";

/**
 * @param midnightConfig - Complete captured Midnight endpoints.
 * @param evmConfig - Complete captured EVM chain inputs.
 * @param input - Explicit overrides, with absent values resolved from publications.
 * @returns Eagerly validated SDK environment inputs.
 * @throws {Error} If the deployment or capability inputs are incomplete or invalid.
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
  const defaults = getRuntimeDefaults(midnightConfig.networkId);
  const config = validateRuntimeConfig({
    midnight: midnightConfig,
    evm: evmConfig,
    vault: {
      contractAddress: input.contractAddress ?? defaults.vault.contractAddress,
      signetContractAddress: input.signetContractAddress ?? defaults.vault.signetContractAddress,
      mpcPubkey: input.mpcSecpPub ?? defaults.vault.mpcPubkey,
    },
  });
  const result = resolveVaultConfiguration(config);
  if (result.status === "unavailable") throw new Error(result.reasons.join(" "));
  return result.value;
}
