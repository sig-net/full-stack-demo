"use client";

import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { createContext, type JSX, type ReactNode, useContext, useEffect } from "react";
import { erc20Abi, getAddress } from "viem";

import type { Wallet } from "@/lib/evm/wallet/Wallet";

import { useEvmWallet } from "./evm-wallet-context";

interface EvmBalances {
  eth: bigint;
  tokens: { erc20Address: string; decimals: number; units: bigint }[];
}

/**
 * Keeps balance reads scoped to the captured signing session and evicts them when it is replaced.
 *
 * @param wallet - Active signing session, or null while disconnected.
 * @param tokens - EVM token addresses whose precision and balances are read together.
 * @returns Balance query state with obsolete-session results rejected.
 */
export function useWalletBalances(
  wallet: Wallet | null,
  tokens: readonly string[],
): UseQueryResult<EvmBalances> {
  const queries = useQueryClient();
  useEffect(
    () => () => {
      if (wallet) queries.removeQueries({ queryKey: ["evm-balances", wallet.sessionId] });
    },
    [wallet, queries],
  );
  return useQuery({
    queryKey: ["evm-balances", wallet?.sessionId, wallet?.chain.id, wallet?.account, tokens],
    enabled: !!wallet,
    gcTime: 0,
    retry: false,
    refetchInterval: wallet ? 15_000 : false,
    queryFn: async () => {
      if (!wallet) throw new Error("Connect an EVM wallet first.");
      const account = wallet.account;
      const client = wallet.publicClient;
      const [eth, balances] = await Promise.all([
        client.getBalance({ address: account }),
        Promise.all(
          tokens.map(async (token) => {
            const address = getAddress(token);
            const [decimals, units] = await Promise.all([
              client.readContract({
                address,
                abi: erc20Abi,
                functionName: "decimals",
              }),
              client.readContract({
                address,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [account],
              }),
            ]);
            if (!Number.isInteger(decimals) || decimals < 0)
              throw new Error("Token decimals are unavailable.");
            return { erc20Address: token, decimals, units };
          }),
        ),
      ]);
      wallet.assertActive();
      return { eth, tokens: balances };
    },
  });
}

const EvmBalancesContext = createContext<ReturnType<typeof useWalletBalances> | null>(null);
/**
 * Shares session-scoped balance observations for the supplied token catalogue.
 *
 * @param props - Provider content and observed token addresses.
 * @param props.children - Components consuming balance state.
 * @param props.tokens - EVM token addresses to observe.
 * @returns The balance query context.
 */
export function EvmBalancesProvider({
  children,
  tokens,
}: {
  children: ReactNode;
  tokens: readonly string[];
}): JSX.Element {
  const { wallet } = useEvmWallet();
  const balances = useWalletBalances(wallet, tokens);
  return <EvmBalancesContext.Provider value={balances}>{children}</EvmBalancesContext.Provider>;
}
/**
 * Reads balances without creating a separate polling owner.
 *
 * @returns The current session's balance query state.
 * @throws {Error} If the balance provider is missing.
 */
export function useEvmBalances(): UseQueryResult<EvmBalances> {
  const value = useContext(EvmBalancesContext);
  if (!value) throw new Error("useEvmBalances requires EvmBalancesProvider.");
  return value;
}
