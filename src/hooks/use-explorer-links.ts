"use client";

import {
  evmExplorerLink,
  type EvmExplorerSource,
  type ExplorerAvailability,
  midnightExplorerLink,
} from "@/lib/explorer";
import { useConfiguration } from "@/providers/configuration-context";

/** Explorer destinations for identifiers that belong to the currently applied configuration. */
export interface AppliedExplorerLinks {
  readonly evmSource: EvmExplorerSource;
  readonly evmAddress: (value: string) => ExplorerAvailability;
  readonly evmTransaction: (value: string) => ExplorerAvailability;
  readonly midnightContract: (value: string) => ExplorerAvailability;
}

/**
 * Live identifiers belong to the applied configuration. A submitted receipt keeps the chain and
 * explorer captured with it, so history resolves its own links from the record.
 *
 * @returns Builders bound to the applied EVM chain and Midnight network.
 */
export function useAppliedExplorerLinks(): AppliedExplorerLinks {
  const { applied } = useConfiguration();
  const evmSource: EvmExplorerSource = {
    explorerUrl: applied.evm.explorerUrl,
    chainId: applied.evm.chainId,
  };
  return {
    evmSource,
    evmAddress: (value) => evmExplorerLink(evmSource, "address", value),
    evmTransaction: (value) => evmExplorerLink(evmSource, "transaction", value),
    midnightContract: (value) =>
      midnightExplorerLink(applied.midnight.networkId, "contract", value),
  };
}
