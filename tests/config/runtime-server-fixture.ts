import { vi } from "vitest";

import { getEvmChainConfig } from "@/lib/config/evm";
import { getMidnightChainConfig } from "@/lib/config/midnight";
import {
  createRuntimeConfigDto,
  createRuntimeConfiguration,
  getRuntimeDefaults,
  type RuntimeConfig,
  type RuntimeConfiguration,
  validateRuntimeConfig,
} from "@/lib/config/runtime";

/** @returns Explicit deployment inputs for a browser fixture with local environment stubs. */
export function testRuntimeConfiguration(): RuntimeConfig {
  const defaults = getRuntimeDefaults("stagenet");
  return validateRuntimeConfig({
    midnight: getMidnightChainConfig(),
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
}

/**
 * @returns A configuration owner matching the fixture's attestation response.
 */
export function mockMatchingRuntimeServer(): RuntimeConfiguration {
  const config = testRuntimeConfiguration();
  const owner = createRuntimeConfiguration(config);
  const snapshot = owner.getSnapshot();
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>((input) => {
      if (input !== "/api/runtime-config")
        return Promise.reject(new Error("Unexpected fetch outside runtime configuration fixture"));
      return Promise.resolve(
        Response.json({
          config: createRuntimeConfigDto(config),
          fingerprint: snapshot.applied.fingerprint,
        }),
      );
    }),
  );
  return owner;
}
