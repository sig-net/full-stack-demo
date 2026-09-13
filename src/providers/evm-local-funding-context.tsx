"use client";

import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import {
  createContext,
  type JSX,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import type { Address } from "viem";

import { ERC20_TOKENS } from "@/lib/constants/token-metadata";
import { fundingErrorSchema, hasLocalEvmFunds } from "@/lib/wallet-funding";

import { useEvmBalances } from "./evm-balances-context";
import { useEvmWallet } from "./evm-wallet-context";
import { useRuntimeConfig } from "./runtime-config-context";

interface FundingRecipient {
  address: Address;
  session: string | undefined;
}

interface AddressFundingState {
  funding: UseMutationResult<string | null, Error, FundingRecipient>;
  fund: () => Promise<void>;
  refreshError: string | null;
}

interface EvmLocalFundingState extends AddressFundingState {
  ready: boolean;
  fundingUnavailable: string | null;
}

/**
 * Coalesces funding requests for the captured recipient and rejects stale completions.
 *
 * @param address - Current signing account.
 * @param session - Identity of the current signing session.
 * @param refresh - Reloads balances after successful funding.
 * @param requireHeaders - Supplies the captured server configuration attestation.
 * @returns Funding mutation state and its recipient-scoped action.
 */
export function useAddressFunding(
  address: Address | undefined,
  session: string | undefined,
  refresh: () => Promise<void>,
  requireHeaders: () => Record<string, string> = () => ({}),
): AddressFundingState {
  const current = useRef({ address, session });
  const pending = useRef<{
    address: Address;
    session: string | undefined;
    promise: Promise<void>;
  } | null>(null);
  const mutation = useMutation({
    mutationKey: ["evm-local-funding", session, address],
    mutationFn: async (recipient: FundingRecipient): Promise<string | null> => {
      const assertRecipient = (): void => {
        if (
          current.current.address !== recipient.address ||
          current.current.session !== recipient.session
        )
          throw new Error("EVM funding recipient changed.");
      };
      assertRecipient();
      const response = await fetch("/api/local-funding/evm", {
        method: "POST",
        headers: { "content-type": "application/json", ...requireHeaders() },
        body: JSON.stringify({ address: recipient.address }),
      });
      const body: unknown = await response.json();
      assertRecipient();
      if (!response.ok) {
        const parsed = fundingErrorSchema.safeParse(body);
        throw new Error(
          parsed.success ? (parsed.data.error ?? "EVM funding failed.") : "EVM funding failed.",
        );
      }
      try {
        await refresh();
        assertRecipient();
      } catch {
        assertRecipient();
        return "Funding succeeded. Balance refresh failed. Retry balances before transferring.";
      }
      return null;
    },
  });
  const { reset } = mutation;
  useEffect(() => {
    reset();
  }, [address, session, reset]);
  useLayoutEffect(() => {
    current.current = { address, session };
    return () => {
      current.current = { address: undefined, session: undefined };
    };
  }, [address, session]);
  const fund = (): Promise<void> => {
    if (!address) return Promise.reject(new Error("Connect an EVM wallet first."));
    if (pending.current?.address === address && pending.current.session === session)
      return pending.current.promise;
    const promise = mutation
      .mutateAsync({ address, session })
      .then(() => undefined)
      .finally(() => {
        if (pending.current?.promise === promise) pending.current = null;
      });
    pending.current = { address, session, promise };
    return promise;
  };
  return { funding: mutation, fund, refreshError: mutation.data ?? null };
}

function useEvmLocalFundingOwner(): EvmLocalFundingState {
  const runtime = useRuntimeConfig();
  const { wallet } = useEvmWallet();
  const balances = useEvmBalances();
  const funding = useAddressFunding(
    wallet?.account,
    wallet?.sessionId,
    async () => {
      await balances.refetch({ throwOnError: true });
    },
    runtime.requireServerHeaders,
  );
  const usdc = balances.data?.tokens.find(
    (token) =>
      token.erc20Address === ERC20_TOKENS.find((token) => token.symbol === "USDC")?.erc20Address,
  );
  const ready =
    !!wallet &&
    balances.isSuccess &&
    hasLocalEvmFunds(balances.data.eth, usdc?.units, usdc?.decimals);
  return { ...funding, ready, fundingUnavailable: runtime.serverUnavailable };
}
const EvmLocalFundingContext = createContext<ReturnType<typeof useEvmLocalFundingOwner> | null>(
  null,
);
/**
 * Shares local funding eligibility with consumers of the connected EVM account.
 *
 * @param props - Provider content.
 * @param props.children - Components using funding state.
 * @returns The funding context surrounding its consumers.
 */
export function EvmLocalFundingProvider({ children }: { children: ReactNode }): JSX.Element {
  const value = useEvmLocalFundingOwner();
  return (
    <EvmLocalFundingContext.Provider value={value}>{children}</EvmLocalFundingContext.Provider>
  );
}
/**
 * Reads funding eligibility and actions for the active EVM session.
 *
 * @returns Funding state, refresh failures and server availability.
 * @throws {Error} If the funding provider is missing.
 */
export function useEvmLocalFunding(): EvmLocalFundingState {
  const value = useContext(EvmLocalFundingContext);
  if (!value) throw new Error("useEvmLocalFunding requires EvmLocalFundingProvider.");
  return value;
}
