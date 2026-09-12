'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { useVault } from './vault-context';
import type { VaultBinding } from '@/lib/midnight/vault-session';
import { readBalances } from '@/lib/midnight/vault-balances';
import { MIDNIGHT_TOKENS } from '@/lib/constants/token-metadata';
import { useMidnightProgress } from '@/hooks/use-midnight-progress';

function balanceOptions(binding: VaultBinding | null) {
  return queryOptions({
    queryKey: ['vault-balances', binding?.sessionId ?? 'disabled'],
    enabled: binding !== null,
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      if (!binding) throw new Error('Vault is not ready.');
      binding.assertActive();
      const result = await readBalances(
        binding.providers,
        binding.environment,
        MIDNIGHT_TOKENS.map(token => token.erc20Address),
        binding.depositAddress,
        binding.vaultAddress,
      );
      binding.assertActive();
      return result;
    },
  });
}

function useVaultBalanceOwner() {
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
          queryKey: ['vault-balances', binding.sessionId],
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
      Object.values(balances.perToken).some(token =>
        Object.values(token).some(value => value === null),
      ));
  const refresh = async (target = vault.requireBinding()) => {
    target.assertActive();
    await queries.fetchQuery(balanceOptions(target));
  };
  return {
    balances,
    loading: !!binding && query.isFetching,
    error:
      binding && query.isError
        ? 'Balance refresh failed.'
        : partial
          ? 'Some balances or token decimals are unavailable. Retry the balance read.'
          : null,
    refresh,
  };
}
const VaultBalancesContext = createContext<ReturnType<
  typeof useVaultBalanceOwner
> | null>(null);
export function VaultBalancesProvider({ children }: { children: ReactNode }) {
  const value = useVaultBalanceOwner();
  return (
    <VaultBalancesContext.Provider value={value}>
      {children}
    </VaultBalancesContext.Provider>
  );
}
export function useVaultBalances() {
  const value = useContext(VaultBalancesContext);
  if (!value)
    throw new Error('useVaultBalances requires VaultBalancesProvider.');
  return value;
}
