'use client';

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react';
import { useMutation } from '@tanstack/react-query';
import type { Address } from 'viem';
import { ERC20_TOKENS } from '@/lib/constants/token-metadata';
import { hasLocalEvmFunds } from '@/lib/wallet-funding';
import { useEvmWallet } from './evm-wallet-context';
import { useEvmBalances } from './evm-balances-context';

export function useAddressFunding(
  address: Address | undefined,
  session: string | undefined,
  refresh: () => Promise<unknown>,
) {
  const current = useRef({ address, session });
  const pending = useRef<{
    address: Address;
    session: string | undefined;
    promise: Promise<void>;
  } | null>(null);
  const mutation = useMutation({
    mutationKey: ['evm-local-funding', session, address],
    mutationFn: async (recipient: {
      address: Address;
      session: string | undefined;
    }) => {
      const assertRecipient = () => {
        if (
          current.current.address !== recipient.address ||
          current.current.session !== recipient.session
        )
          throw new Error('EVM funding recipient changed.');
      };
      assertRecipient();
      const response = await fetch('/api/local-funding/evm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: recipient.address }),
      });
      const body = await response.json();
      assertRecipient();
      if (!response.ok) throw new Error(body.error ?? 'EVM funding failed.');
      try {
        await refresh();
        assertRecipient();
      } catch {
        assertRecipient();
        return 'Funding succeeded. Balance refresh failed. Retry balances before transferring.';
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
    if (!address)
      return Promise.reject(new Error('Connect an EVM wallet first.'));
    if (
      pending.current?.address === address &&
      pending.current.session === session
    )
      return pending.current.promise;
    const promise = mutation
      .mutateAsync({ address, session })
      .then(() => {})
      .finally(() => {
        if (pending.current?.promise === promise) pending.current = null;
      });
    pending.current = { address, session, promise };
    return promise;
  };
  return { funding: mutation, fund, refreshError: mutation.data ?? null };
}

function useEvmLocalFundingOwner() {
  const { wallet } = useEvmWallet();
  const balances = useEvmBalances();
  const funding = useAddressFunding(wallet?.account, wallet?.sessionId, () =>
    balances.refetch({ throwOnError: true }),
  );
  const usdc = balances.data?.tokens.find(
    token =>
      token.erc20Address ===
      ERC20_TOKENS.find(token => token.symbol === 'USDC')?.erc20Address,
  );
  const ready =
    !!wallet &&
    balances.isSuccess &&
    hasLocalEvmFunds(balances.data.eth, usdc?.units, usdc?.decimals);
  return { ...funding, ready };
}
const EvmLocalFundingContext = createContext<ReturnType<
  typeof useEvmLocalFundingOwner
> | null>(null);
export function EvmLocalFundingProvider({ children }: { children: ReactNode }) {
  const value = useEvmLocalFundingOwner();
  return (
    <EvmLocalFundingContext.Provider value={value}>
      {children}
    </EvmLocalFundingContext.Provider>
  );
}
export function useEvmLocalFunding() {
  const value = useContext(EvmLocalFundingContext);
  if (!value)
    throw new Error('useEvmLocalFunding requires EvmLocalFundingProvider.');
  return value;
}
