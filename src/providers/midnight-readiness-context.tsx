"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { createContext, type JSX, type ReactNode, useContext } from "react";

import type { Wallet } from "@/lib/midnight/wallet/Wallet";
import { hasMidnightFees } from "@/lib/wallet-funding";

import { useMidnightConnection } from "./midnight-wallet-context";

interface ReadinessState {
  wallet: Wallet | null;
  balances: UseQueryResult<{ dust: bigint; night: bigint }>;
  ready: boolean;
  resourcesReady: boolean;
  transactionUnavailable: string | undefined;
  requireReady: () => Promise<void>;
}

function useReadinessOwner(): ReadinessState {
  const connection = useMidnightConnection();
  const wallet = connection.wallet;
  const balances = useQuery({
    queryKey: ["midnight-readiness", connection.session],
    enabled: !!wallet,
    gcTime: 0,
    refetchInterval: wallet ? 5_000 : false,
    queryFn: async () => {
      if (!wallet) throw new Error("Connect Midnight first.");
      const [dust, unshielded] = await Promise.all([
        wallet.getDustBalance(),
        wallet.getUnshieldedBalances(),
      ]);
      if (!connection.isCurrent(wallet)) throw new Error("Wallet session changed.");
      return {
        dust,
        night: Object.values(unshielded).reduce((sum, value) => sum + value, 0n),
      };
    },
  });
  const resourcesReady = !!wallet && !balances.isError && hasMidnightFees(balances.data?.dust);
  const ready = resourcesReady && !wallet.transactionUnavailable;
  return {
    wallet,
    balances,
    ready,
    resourcesReady,
    transactionUnavailable: wallet?.transactionUnavailable,
    requireReady: async () => {
      if (!wallet || !connection.isCurrent(wallet)) throw new Error("Connect Midnight first.");
      if (wallet.transactionUnavailable) throw new Error(wallet.transactionUnavailable);
      const dust = await wallet.getDustBalance();
      if (!connection.isCurrent(wallet)) throw new Error("Wallet session changed.");
      if (!hasMidnightFees(dust))
        throw new Error(
          "Midnight DUST is below the transaction threshold. Fund the wallet or retry readiness.",
        );
    },
  };
}

const MidnightReadinessContext = createContext<ReturnType<typeof useReadinessOwner> | null>(null);
/**
 * Shares observed Midnight fee readiness for the connected session.
 *
 * @param props - Provider content.
 * @param props.children - Components sharing readiness state.
 * @returns The Midnight readiness context.
 */
export function MidnightReadinessProvider({ children }: { children: ReactNode }): JSX.Element {
  const value = useReadinessOwner();
  return (
    <MidnightReadinessContext.Provider value={value}>{children}</MidnightReadinessContext.Provider>
  );
}
/**
 * Reads readiness separately from vault binding and shielded token balances.
 *
 * @returns Observed fee balances and the guarded readiness check.
 * @throws {Error} If the readiness provider is missing.
 */
export function useMidnightReadiness(): ReadinessState {
  const value = useContext(MidnightReadinessContext);
  if (!value) throw new Error("useMidnightReadiness requires MidnightReadinessProvider.");
  return value;
}
