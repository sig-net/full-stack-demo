import type { RuntimeConfig } from "./runtime";

/** Public endpoint settings that identify the server's fixed local faucets. */
export interface LocalFaucetDescriptor {
  readonly available: boolean;
  readonly midnight: {
    readonly networkId: "undeployed";
    readonly indexerUrl: string;
    readonly indexerWsUrl: string;
    readonly nodeUrl: string;
    readonly proofServerUrl: string;
  };
  readonly evm: {
    readonly chainId: "11155111";
    readonly rpcUrl: string;
  };
}

/**
 * Checks whether the browser's applied configuration names the same local services.
 *
 * @param config - Applied browser configuration.
 * @param descriptor - Server-provided local faucet endpoint settings.
 * @returns Whether the configuration can request the local faucets.
 */
export function isExactLocalFaucetConfiguration(
  config: RuntimeConfig,
  descriptor: LocalFaucetDescriptor,
): boolean {
  return (
    descriptor.available &&
    config.midnight.networkId === descriptor.midnight.networkId &&
    config.midnight.indexerUrl === descriptor.midnight.indexerUrl &&
    config.midnight.indexerWsUrl === descriptor.midnight.indexerWsUrl &&
    config.midnight.nodeUrl === descriptor.midnight.nodeUrl &&
    config.midnight.proofServerUrl === descriptor.midnight.proofServerUrl &&
    config.evm.network === "local" &&
    config.evm.chainId === BigInt(descriptor.evm.chainId) &&
    config.evm.rpcUrl === descriptor.evm.rpcUrl
  );
}
