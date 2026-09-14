import { useQuery } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";

import type { Wallet } from "@/lib/midnight/wallet/Wallet";
import type { useMidnightReadiness } from "@/providers/midnight-readiness-context";

/**
 * Supplies mounted query and mutation results for tests whose boundary starts after wallet funding.
 *
 * @param wallet - Captured wallet presented as funded to the operation owner.
 * @returns Completed readiness capabilities backed by actual React Query hooks.
 */
export function useReadyMidnightFixture(wallet: Wallet): ReturnType<typeof useMidnightReadiness> {
  const registration = useMutation({ mutationFn: (): Promise<void> => Promise.resolve() });
  return {
    wallet,
    balances: useQuery({
      queryKey: ["fixture-readiness"],
      queryFn: () =>
        Promise.resolve({ dust: 100000000000000000n, night: 1n, unregisteredNight: 0n }),
      initialData: { dust: 100000000000000000n, night: 1n, unregisteredNight: 0n },
      enabled: false,
    }),
    ready: true,
    resourcesReady: true,
    transactionUnavailable: undefined,
    registrationUnavailable: undefined,
    registration,
    registerNight: () => registration.mutateAsync(),
    requireReady: () => Promise.resolve(),
  };
}
