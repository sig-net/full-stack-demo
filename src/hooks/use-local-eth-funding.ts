"use client";

import { toast } from "sonner";
import { getAddress } from "viem";

import { useEvmLocalFunding } from "@/providers/evm-local-funding-context";

/** Local ETH funding as one surface uses it, reading the shared owner's in-flight state. */
export interface LocalEthFunding {
  /** Reason the local faucet is not offered, absent when the exact local configuration applies. */
  unavailable: string | null;
  /** Whether the shared owner already has a request in flight for this account. */
  isFunding: (address: string) => boolean;
  fund: (address: string) => Promise<void>;
}

/**
 * Reports the funding outcome for this surface and reloads the affected balance afterwards.
 *
 * In-flight ownership belongs to the local funding owner, so two controls for one account share
 * a single faucet request and a second click joins the first rather than issuing another.
 *
 * @param onFunded - Reload of the affected balance, run after a successful funding request.
 * @returns Faucet availability, the shared in-flight check and the funding action.
 */
export function useLocalEthFunding(onFunded: () => Promise<void>): LocalEthFunding {
  const localFunding = useEvmLocalFunding();
  return {
    unavailable: localFunding.fundingUnavailable,
    isFunding: (address: string): boolean =>
      localFunding.fundingAddresses.includes(getAddress(address)),
    fund: async (address: string): Promise<void> => {
      try {
        await localFunding.fundLocalEthAddress(getAddress(address));
        toast.success("Local ETH funding completed.");
        await onFunded();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Local ETH funding failed.");
      }
    },
  };
}
