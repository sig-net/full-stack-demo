import { useMutation, useQuery } from "@tanstack/react-query";

import type { Wallet } from "@/lib/midnight/wallet/Wallet";
import type { useWalletReadiness } from "@/providers/wallet-readiness-context";

/**
 * Supplies mounted query and mutation results for tests whose boundary starts after wallet funding.
 *
 * @param wallet - Captured wallet presented as funded to the operation owner.
 * @returns Completed readiness capabilities backed by actual React Query hooks.
 */
export function useReadyWalletFixture(wallet: Wallet): ReturnType<typeof useWalletReadiness> {
  return {
    wallet,
    balances: useQuery({
      queryKey: ["fixture-readiness"],
      queryFn: () => Promise.resolve({ dust: 100000000000000000n, night: 1n }),
      initialData: { dust: 100000000000000000n, night: 1n },
      enabled: false,
    }),
    eligibility: useQuery({
      queryKey: ["fixture-eligibility"],
      queryFn: () => Promise.resolve(true),
      initialData: true,
      enabled: false,
    }),
    funding: useMutation({ mutationFn: () => Promise.resolve() }),
    fund: () => Promise.resolve(),
    ready: true,
    resourcesReady: true,
    fundingUnavailable: undefined,
    transactionUnavailable: undefined,
    requireReady: () => Promise.resolve(),
  };
}
