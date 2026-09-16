import {
  createRuntimeConfiguration,
  getRuntimeDefaults,
  NETWORK_DEFAULTS,
  type RuntimeConfig,
  type RuntimeConfiguration,
  sepoliaChainConfig,
  validateRuntimeConfig,
} from "@/lib/config/runtime";

/** @returns Explicit deployment inputs for a browser fixture with local environment stubs. */
export function testRuntimeConfiguration(): RuntimeConfig {
  const defaults = getRuntimeDefaults("stagenet");
  return validateRuntimeConfig({
    midnight: NETWORK_DEFAULTS.midnight.undeployed,
    evm: sepoliaChainConfig(
      process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? NETWORK_DEFAULTS.evm.local.rpcUrl,
    ),
    vault: {
      contractAddress:
        process.env.NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS ?? defaults.vault.contractAddress,
      signetContractAddress:
        process.env.NEXT_PUBLIC_MIDNIGHT_SIGNET_CONTRACT_ADDRESS ??
        defaults.vault.signetContractAddress,
      mpcPubkey: process.env.NEXT_PUBLIC_MPC_SECP256K1_PUBKEY ?? defaults.vault.mpcPubkey,
    },
  });
}

/**
 * @returns A configuration owner for browser fixtures.
 */
export function mockMatchingRuntimeServer(): RuntimeConfiguration {
  return createRuntimeConfiguration(testRuntimeConfiguration());
}
