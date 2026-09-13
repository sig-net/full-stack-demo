"use client";

import {
  useMutation,
  type UseMutationResult,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import { createContext, type JSX, type ReactNode, useContext, useEffect, useRef } from "react";
import { z } from "zod";

import { fundingErrorSchema, LOCAL_NIGHT_GRANT, MINIMUM_MIDNIGHT_DUST } from "@/lib/wallet-funding";

import { useMidnightReadiness } from "./midnight-readiness-context";
import { useMidnightConnection } from "./midnight-wallet-context";
import { useRuntimeConfig } from "./runtime-config-context";

interface LocalFundingState {
  eligibility: UseQueryResult<boolean>;
  funding: UseMutationResult<void, Error, void>;
  fund: () => Promise<void>;
  fundingUnavailable: string | undefined;
}

function useLocalFundingOwner(): LocalFundingState {
  const runtime = useRuntimeConfig();
  const connection = useMidnightConnection();
  const { wallet, balances } = useMidnightReadiness();
  const pending = useRef<Promise<void> | null>(null);
  const eligibility = useQuery({
    queryKey: ["local-funding-eligibility"],
    queryFn: async () => {
      const response = await fetch("/api/local-funding/evm");
      if (!response.ok) throw new Error("Local funding eligibility is unavailable.");
      const input: unknown = await response.json();
      return z.object({ eligible: z.boolean() }).parse(input).eligible;
    },
    refetchInterval: 30_000,
  });
  const funding = useMutation({
    mutationKey: ["midnight-funding", connection.session],
    mutationFn: async () => {
      if (!wallet) throw new Error("Connect Midnight first.");
      const assertCurrent = (): void => {
        if (!connection.isCurrent(wallet)) throw new Error("Wallet session changed.");
      };
      assertCurrent();
      runtime.requireServerHeaders();
      if (!wallet.ensureFeeReady || !wallet.unshieldedPublicKey)
        throw new Error(
          wallet.fundingUnavailable ?? "Local Midnight funding is unavailable for this wallet.",
        );
      const unshielded = await wallet.getUnshieldedBalances();
      assertCurrent();
      if (Object.values(unshielded).reduce((sum, value) => sum + value, 0n) < LOCAL_NIGHT_GRANT) {
        const response = await fetch("/api/local-funding/midnight", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...runtime.requireServerHeaders(),
          },
          body: JSON.stringify({
            address: wallet.unshieldedAddress,
            publicKey: wallet.unshieldedPublicKey,
          }),
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
      await wallet.ensureFeeReady(MINIMUM_MIDNIGHT_DUST);
      assertCurrent();
      await balances.refetch({ throwOnError: true });
      assertCurrent();
    },
  });
  const { reset } = funding;
  useEffect(() => {
    reset();
    pending.current = null;
  }, [connection.session, reset]);
  const fund = (): Promise<void> => {
    if (pending.current) return pending.current;
    const operation = funding.mutateAsync().finally(() => {
      if (pending.current === operation) pending.current = null;
    });
    pending.current = operation;
    return operation;
  };
  return {
    eligibility,
    funding,
    fund,
    fundingUnavailable: runtime.serverUnavailable ?? wallet?.fundingUnavailable,
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
