import { getEvmChainConfig } from "./evm";
import { getMidnightChainConfig } from "./midnight";
import {
  getRuntimeDefaults,
  resolveVaultConfiguration,
  type RuntimeConfig,
  runtimeFingerprint,
  validateRuntimeConfig,
} from "./runtime";

/** Server deployment captured independently of editable browser defaults. */
export interface ServerRuntimeConfiguration {
  readonly config: RuntimeConfig;
  readonly fingerprint: ReturnType<typeof runtimeFingerprint>;
}

/**
 * @returns Validated server deployment inputs and their operational fingerprint.
 * @throws {Error} If required deployment inputs are invalid or unavailable.
 */
export function serverRuntimeConfiguration(): ServerRuntimeConfiguration {
  const midnight = getMidnightChainConfig();
  const defaults = getRuntimeDefaults(midnight.networkId);
  const config = validateRuntimeConfig({
    midnight,
    evm: getEvmChainConfig(),
    vault: {
      contractAddress:
        process.env.NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS ?? defaults.vault.contractAddress,
      signetContractAddress:
        process.env.NEXT_PUBLIC_MIDNIGHT_SIGNET_CONTRACT_ADDRESS ??
        defaults.vault.signetContractAddress,
      mpcPubkey: process.env.NEXT_PUBLIC_MPC_SECP256K1_PUBKEY ?? defaults.vault.mpcPubkey,
    },
  });
  if (resolveVaultConfiguration(config).status !== "ready")
    throw new Error("Server deployment configuration is unavailable.");
  return { config, fingerprint: runtimeFingerprint(config) };
}

/**
 * @param request - Request carrying the configuration fingerprint header.
 * @returns The matching server configuration.
 * @throws {Error} If the deployment is unavailable or the browser attestation differs.
 */
export function requireServerConfiguration(request: Request): ServerRuntimeConfiguration {
  const expected = serverRuntimeConfiguration();
  if (request.headers.get("x-vault-configuration") !== expected.fingerprint)
    throw new Error(
      "Browser configuration differs from the server deployment. Apply matching configuration or use independent wallet actions.",
    );
  return expected;
}
