"use client";

import {
  useMutation,
  type UseMutationResult,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import { createContext, type JSX, type ReactNode, useContext } from "react";

import type { Wallet } from "@/lib/midnight/wallet/Wallet";
import { hasMidnightFees, MINIMUM_MIDNIGHT_DUST } from "@/lib/wallet-funding";

import { useMidnightConnection } from "./midnight-wallet-context";

interface ReadinessState {
  wallet: Wallet | null;
  balances: UseQueryResult<{ dust: bigint; night: bigint; unregisteredNight: bigint | undefined }>;
  ready: boolean;
  resourcesReady: boolean;
  transactionUnavailable: string | undefined;
  registrationUnavailable: string | undefined;
  registration: UseMutationResult<void, Error, void>;
  registerNight: () => Promise<void>;
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
      const [dust, unshielded, unregisteredNight] = await Promise.all([
        (() => wallet.getDustBalance())(),
        (() => wallet.getUnshieldedBalances())(),
        (() => wallet.getUnregisteredNightBalance?.())(),
      ]);
      if (!connection.isCurrent(wallet)) throw new Error("Wallet session changed.");
      return {
        dust,
        night: Object.values(unshielded).reduce((sum, value) => sum + value, 0n),
        unregisteredNight,
      };
    },
  });
  const resourcesReady = !!wallet && !balances.isError && hasMidnightFees(balances.data?.dust);
  const ready = resourcesReady && !wallet.transactionUnavailable;
  const registration = useMutation({
    mutationKey: ["midnight-registration", connection.session],
    mutationFn: async (): Promise<void> => {
      if (!wallet) throw new Error("Connect Midnight first.");
      if (!wallet.registerNightForDust || !wallet.getUnregisteredNightBalance)
        throw new Error(
          wallet.registrationUnavailable ?? "This wallet cannot register NIGHT for DUST.",
        );
      const unregisteredNight = await wallet.getUnregisteredNightBalance();
      if (!connection.isCurrent(wallet)) throw new Error("Wallet session changed.");
      if (unregisteredNight === 0n)
        throw new Error("Receive NIGHT before registering it for DUST.");
      await wallet.registerNightForDust(MINIMUM_MIDNIGHT_DUST);
      if (!connection.isCurrent(wallet)) throw new Error("Wallet session changed.");
      await balances.refetch({ throwOnError: true });
      if (!connection.isCurrent(wallet)) throw new Error("Wallet session changed.");
    },
  });
  return {
    wallet,
    balances,
    ready,
    resourcesReady,
    transactionUnavailable: wallet?.transactionUnavailable,
    registrationUnavailable: wallet?.registrationUnavailable,
    registration,
    registerNight: () => registration.mutateAsync(),
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
