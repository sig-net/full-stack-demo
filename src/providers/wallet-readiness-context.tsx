'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMidnightConnection } from './midnight-wallet-context';
import {
  hasMidnightFees,
  MINIMUM_MIDNIGHT_DUST,
  LOCAL_NIGHT_GRANT,
} from '@/lib/wallet-funding';

function useReadinessOwner() {
  const connection = useMidnightConnection();
  const wallet = connection.wallet;
  const pending = useRef<Promise<void> | null>(null);
  const balances = useQuery({
    queryKey: ['midnight-readiness', connection.session],
    enabled: !!wallet,
    gcTime: 0,
    refetchInterval: wallet ? 5_000 : false,
    queryFn: async () => {
      if (!wallet) throw new Error('Connect Midnight first.');
      const [dust, unshielded] = await Promise.all([
        wallet.getDustBalance(),
        wallet.getUnshieldedBalances(),
      ]);
      if (!connection.isCurrent(wallet))
        throw new Error('Wallet session changed.');
      return {
        dust,
        night: Object.values(unshielded).reduce(
          (sum, value) => sum + value,
          0n,
        ),
      };
    },
  });
  const eligibility = useQuery({
    queryKey: ['local-funding-eligibility'],
    queryFn: async () => {
      const response = await fetch('/api/local-funding/evm');
      if (!response.ok)
        throw new Error('Local funding eligibility is unavailable.');
      return ((await response.json()) as { eligible: boolean }).eligible;
    },
    refetchInterval: 30_000,
  });
  const funding = useMutation({
    mutationKey: ['midnight-funding', connection.session],
    mutationFn: async () => {
      if (!wallet) throw new Error('Connect Midnight first.');
      const assertCurrent = () => {
        if (!connection.isCurrent(wallet))
          throw new Error('Wallet session changed.');
      };
      assertCurrent();
      const unshielded = await wallet.getUnshieldedBalances();
      assertCurrent();
      if (
        Object.values(unshielded).reduce((sum, value) => sum + value, 0n) <
        LOCAL_NIGHT_GRANT
      ) {
        const response = await fetch('/api/local-funding/midnight', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            address: wallet.unshieldedAddress,
            publicKey: wallet.unshieldedPublicKey,
          }),
        });
        assertCurrent();
        const body = await response.json();
        assertCurrent();
        if (!response.ok)
          throw new Error(body.error ?? 'Midnight funding failed.');
      }
      await wallet.ensureFeeReady(MINIMUM_MIDNIGHT_DUST);
      assertCurrent();
      await balances.refetch({ throwOnError: true });
      assertCurrent();
    },
  });
  useEffect(() => {
    funding.reset();
    pending.current = null;
    // Wallet generations own visible funding progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.session]);
  const fund = () => {
    if (pending.current) return pending.current;
    const operation = funding.mutateAsync().finally(() => {
      if (pending.current === operation) pending.current = null;
    });
    pending.current = operation;
    return operation;
  };
  const ready =
    !!wallet && !balances.isError && hasMidnightFees(balances.data?.dust);
  return {
    wallet,
    balances,
    eligibility,
    funding,
    fund,
    ready,
    requireReady: async () => {
      if (!wallet || !connection.isCurrent(wallet))
        throw new Error('Connect Midnight first.');
      const dust = await wallet.getDustBalance();
      if (!connection.isCurrent(wallet))
        throw new Error('Wallet session changed.');
      if (!hasMidnightFees(dust))
        throw new Error(
          'Midnight DUST is below the transaction threshold. Fund the wallet or retry readiness.',
        );
    },
  };
}

const WalletReadinessContext = createContext<ReturnType<
  typeof useReadinessOwner
> | null>(null);
export function WalletReadinessProvider({ children }: { children: ReactNode }) {
  const value = useReadinessOwner();
  return (
    <WalletReadinessContext.Provider value={value}>
      {children}
    </WalletReadinessContext.Provider>
  );
}
export function useWalletReadiness() {
  const value = useContext(WalletReadinessContext);
  if (!value)
    throw new Error('useWalletReadiness requires WalletReadinessProvider.');
  return value;
}
