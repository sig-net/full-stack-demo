'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { erc20Abi, getAddress } from 'viem';
import type { Wallet } from '@/lib/evm/wallet/Wallet';
import { useEvmWallet } from './evm-wallet-context';

export function useWalletBalances(
  wallet: Wallet | null,
  tokens: readonly string[],
) {
  const queries = useQueryClient();
  useEffect(
    () => () => {
      if (wallet)
        queries.removeQueries({ queryKey: ['evm-balances', wallet.sessionId] });
    },
    [wallet, queries],
  );
  return useQuery({
    queryKey: [
      'evm-balances',
      wallet?.sessionId,
      wallet?.chain.id,
      wallet?.account,
      tokens,
    ],
    enabled: !!wallet,
    gcTime: 0,
    retry: false,
    refetchInterval: wallet ? 15_000 : false,
    queryFn: async () => {
      if (!wallet) throw new Error('Connect an EVM wallet first.');
      const account = wallet.account;
      const client = wallet.publicClient;
      const [eth, balances] = await Promise.all([
        client.getBalance({ address: account }),
        Promise.all(
          tokens.map(async token => {
            const address = getAddress(token);
            const [decimals, units] = await Promise.all([
              client.readContract({
                address,
                abi: erc20Abi,
                functionName: 'decimals',
              }),
              client.readContract({
                address,
                abi: erc20Abi,
                functionName: 'balanceOf',
                args: [account],
              }),
            ]);
            if (!Number.isInteger(decimals) || decimals < 0)
              throw new Error('Token decimals are unavailable.');
            return { erc20Address: token, decimals, units };
          }),
        ),
      ]);
      wallet.assertActive();
      return { eth, tokens: balances };
    },
  });
}

const EvmBalancesContext = createContext<ReturnType<
  typeof useWalletBalances
> | null>(null);
export function EvmBalancesProvider({
  children,
  tokens,
}: {
  children: ReactNode;
  tokens: readonly string[];
}) {
  const { wallet } = useEvmWallet();
  const balances = useWalletBalances(wallet, tokens);
  return (
    <EvmBalancesContext.Provider value={balances}>
      {children}
    </EvmBalancesContext.Provider>
  );
}
export function useEvmBalances() {
  const value = useContext(EvmBalancesContext);
  if (!value) throw new Error('useEvmBalances requires EvmBalancesProvider.');
  return value;
}
