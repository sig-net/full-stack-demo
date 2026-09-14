"use client";

import { useQuery } from "@tanstack/react-query";

import type { TokenConfig } from "@/lib/constants/token-metadata";
import {
  type DepositSweepBalance,
  describeDepositSweepBalance,
  type PendingDepositRequest,
} from "@/lib/midnight/deposit-sweep";
import { useVaultBalances } from "@/providers/vault-balances-context";
import { useVault } from "@/providers/vault-context";

const PENDING_REQUEST_POLL_MS = 15_000;

/** Everything the deposit surface needs to start a sweep from tokens already at the address. */
export interface DepositAddressSweep {
  address: string | null;
  balance: DepositSweepBalance;
  pendingRequests: readonly PendingDepositRequest[];
  checkedAt: number | null;
  refreshing: boolean;
  refresh: () => void;
}

/**
 * Observes the deposit address balance and the identity's pending requests for one token.
 *
 * Both reads are scoped to the vault binding, which is replaced whenever the applied network,
 * deployment or identity changes, so a replacement session never inherits either observation.
 * Neither read needs an EVM signing wallet.
 *
 * @param token - Token whose deposit-address balance and pending requests are observed.
 * @returns The derived balance state, the pending requests and one refresh covering both reads.
 */
export function useDepositAddressSweep(token: TokenConfig): DepositAddressSweep {
  const vault = useVault();
  const balances = useVaultBalances();
  const binding = vault.binding;
  const erc20 = token.erc20Address.toLowerCase();
  const observed = balances.balances?.perToken[erc20];
  const pending = useQuery({
    queryKey: ["deposit-pending-requests", binding?.sessionId ?? "disabled", erc20],
    enabled: binding !== null,
    gcTime: 0,
    retry: false,
    refetchInterval: PENDING_REQUEST_POLL_MS,
    queryFn: async (): Promise<PendingDepositRequest[]> => {
      if (!binding) throw new Error("Vault is not ready.");
      binding.assertActive();
      const { readPendingDeposits } = await import("@/lib/midnight/vault");
      const requests = await readPendingDeposits(
        binding.providers,
        binding.environment,
        binding.identity,
        token.erc20Address,
      );
      binding.assertActive();
      return requests;
    },
  });
  const pendingRequests = binding && !pending.isError ? (pending.data ?? []) : [];
  return {
    address: binding?.depositAddress ?? null,
    balance: describeDepositSweepBalance({
      bound: binding !== null,
      loading: balances.loading || pending.isPending,
      failed: balances.error !== null,
      units: observed?.depositUnits ?? null,
      decimals: observed?.decimals ?? null,
      pendingRequests,
      pendingFailed: binding !== null && pending.isError,
      symbol: token.symbol,
    }),
    pendingRequests,
    checkedAt: balances.checkedAt,
    refreshing: balances.loading || pending.isFetching,
    refresh: () => {
      void balances.refresh().catch(() => undefined);
      void pending.refetch();
    },
  };
}
