"use client";

import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type JSX, type ReactNode, useContext, useEffect } from "react";

import { useMidnightProgress } from "@/hooks/use-midnight-progress";
import { MIDNIGHT_TOKENS } from "@/lib/constants/token-metadata";
import { readBalances, type VaultBalances } from "@/lib/midnight/vault-balances";
import type { VaultBinding } from "@/lib/midnight/vault-session";

import { useVault } from "./vault-context";

function balanceOptions(
  binding: VaultBinding | null,
): ReturnType<typeof queryOptions<VaultBalances, Error, VaultBalances, string[]>> {
  return queryOptions({
    queryKey: ["vault-balances", binding?.sessionId ?? "disabled"],
    enabled: binding !== null,
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      if (!binding) throw new Error("Vault is not ready.");
      binding.assertActive();
      const result = await readBalances(
        binding.providers,
        binding.environment,
        MIDNIGHT_TOKENS.map((token) => token.erc20Address),
        binding.depositAddress,
        binding.vaultAddress,
      );
      binding.assertActive();
      return result;
    },
  });
}

interface VaultBalanceState {
  balances: VaultBalances | null;
  loading: boolean;
  error: string | null;
  refresh: (target?: VaultBinding) => Promise<void>;
}

function useVaultBalanceOwner(): VaultBalanceState {
  const vault = useVault();
  const queries = useQueryClient();
  const { binding } = vault;
  const progress = useMidnightProgress();
  const query = useQuery({
    ...balanceOptions(binding),
    refetchInterval: binding && !progress.active ? 5000 : false,
  });
  useEffect(
    () => () => {
      if (binding)
        queries.removeQueries({
          queryKey: ["vault-balances", binding.sessionId],
          exact: true,
        });
    },
    [binding, queries],
  );
  const balances = binding && !query.isError ? (query.data ?? null) : null;
  const partial =
    balances &&
    (balances.night === null ||
      balances.dust === null ||
      Object.values(balances.perToken).some((token) =>
        Object.values(token).some((value) => value === null),
      ));
  const refresh = async (target = vault.requireBinding()): Promise<void> => {
    target.assertActive();
    await queries.fetchQuery(balanceOptions(target));
  };
  return {
    balances,
    loading: !!binding && query.isFetching,
    error:
      binding && query.isError
        ? "Balance refresh failed."
        : partial
          ? "Some balances or token decimals are unavailable. Retry the balance read."
          : null,
    refresh,
  };
}
const VaultBalancesContext = createContext<ReturnType<typeof useVaultBalanceOwner> | null>(null);
/**
 * Owns binding-scoped balances and suspends periodic reads while a vault operation is active.
 *
 * @param props - Provider content.
 * @param props.children - Components sharing wallet, deposit and vault-pool observations.
 * @returns Balance state and explicit refresh for the active binding.
 */
export function VaultBalancesProvider({ children }: { children: ReactNode }): JSX.Element {
  const value = useVaultBalanceOwner();
  return <VaultBalancesContext.Provider value={value}>{children}</VaultBalancesContext.Provider>;
}
/**
 * Reads shared balance observations while retaining unavailable values as distinct from zero.
 *
 * @returns Observed balances, loading or partial-failure feedback and explicit refresh.
 * @throws {Error} If the balance provider is missing.
 */
export function useVaultBalances(): VaultBalanceState {
  const value = useContext(VaultBalancesContext);
  if (!value) throw new Error("useVaultBalances requires VaultBalancesProvider.");
  return value;
}
