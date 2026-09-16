"use client";

import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { createContext, type JSX, type ReactNode, useContext, useEffect, useRef } from "react";

import { fundingErrorSchema, LOCAL_NIGHT_GRANT } from "@/lib/wallet-funding";

import { useConfiguration } from "./configuration-context";
import { useMidnightReadiness } from "./midnight-readiness-context";
import { useMidnightConnection } from "./midnight-wallet-context";

interface LocalFundingState {
  funding: UseMutationResult<void, Error, void>;
  fund: () => Promise<void>;
  fundingUnavailable: string | undefined;
}

function useLocalFundingOwner(): LocalFundingState {
  const { localFaucet: faucet } = useConfiguration();
  const connection = useMidnightConnection();
  const { wallet, balances } = useMidnightReadiness();
  const pending = useRef<Promise<void> | null>(null);
  const funding = useMutation({
    mutationKey: ["midnight-funding", connection.session],
    mutationFn: async () => {
      if (!wallet) throw new Error("Connect Midnight first.");
      const assertCurrent = (): void => {
        if (!connection.isCurrent(wallet)) throw new Error("Wallet session changed.");
      };
      assertCurrent();
      faucet.requireEligible();
      const unshielded = await wallet.getUnshieldedBalances();
      assertCurrent();
      faucet.requireEligible();
      if (Object.values(unshielded).reduce((sum, value) => sum + value, 0n) < LOCAL_NIGHT_GRANT) {
        const response = await fetch("/api/midnight/night-faucet", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address: wallet.unshieldedAddress }),
        });
        assertCurrent();
        const body: unknown = await response.json();
        assertCurrent();
        if (!response.ok) {
          const parsed = fundingErrorSchema.safeParse(body);
          throw new Error(
            parsed.success
              ? (parsed.data.error ?? "Midnight funding failed.")
              : "Midnight funding failed.",
          );
        }
      }
      assertCurrent();
      await balances.refetch({ throwOnError: true });
      assertCurrent();
    },
  });
  const { reset: resetFunding } = funding;
  useEffect(() => {
    resetFunding();
    pending.current = null;
  }, [connection.session, resetFunding]);
  const fund = (): Promise<void> => {
    if (pending.current) return pending.current;
    const operation = funding.mutateAsync().finally(() => {
      if (pending.current === operation) pending.current = null;
    });
    pending.current = operation;
    return operation;
  };
  return {
    funding,
    fund,
    fundingUnavailable: faucet.eligible
      ? undefined
      : "Local funding requires the exact local faucet configuration.",
  };
}

const MidnightLocalFundingContext = createContext<LocalFundingState | null>(null);
/**
 * Shares a single local funding operation across consumers for the connected wallet.
 *
 * @param props - Provider content.
 * @param props.children - Local funding consumers.
 * @returns The local funding context.
 */
export function MidnightLocalFundingProvider({ children }: { children: ReactNode }): JSX.Element {
  const value = useLocalFundingOwner();
  return (
    <MidnightLocalFundingContext.Provider value={value}>
      {children}
    </MidnightLocalFundingContext.Provider>
  );
}
/**
 * Reads local funding eligibility and the deduplicated funding action.
 *
 * @returns The connected wallet's local funding state.
 * @throws {Error} If the local funding provider is missing.
 */
export function useMidnightLocalFunding(): LocalFundingState {
  const value = useContext(MidnightLocalFundingContext);
  if (!value) throw new Error("useMidnightLocalFunding requires MidnightLocalFundingProvider.");
  return value;
}
