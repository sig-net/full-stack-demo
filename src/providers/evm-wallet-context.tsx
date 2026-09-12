'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { erc20Abi, getAddress, type Hash } from 'viem';
import { hasEvmDepositFunds } from '@/lib/wallet-funding';
import { getEvmChainConfig } from '@/lib/config/evm';
import { getEthereumProvider } from '@/lib/rpc';
import {
  ERC20_TOKENS,
  fetchErc20Decimals,
} from '@/lib/constants/token-metadata';
import {
  BrowserWallet,
  type BrowserWalletChoice,
} from '@/lib/evm/wallet/BrowserWallet';
import { transferDeposit } from '@/lib/evm/deposit-transfer';
import { useVaultOperations } from './vault-operations-context';
import { useVaultBalances } from './vault-balances-context';
import { useVault } from './vault-context';
import { useWalletReadiness } from './wallet-readiness-context';
import type { VaultBinding } from '@/lib/midnight/vault-session';

interface DepositTransfer {
  destination: string;
  token: string;
  account: string;
  hash?: Hash;
  units?: bigint;
  status: 'approving' | 'confirming' | 'confirmed' | 'error';
  error?: string;
  binding: VaultBinding;
  sweep: 'ready' | 'pending' | 'complete';
}

function useEvmWalletOwner() {
  const queries = useQueryClient();
  const operations = useVaultOperations();
  const vaultBalances = useVaultBalances();
  const vault = useVault();
  const readiness = useWalletReadiness();
  const transferRef = useRef<DepositTransfer | null>(null);
  const current = useRef<BrowserWallet | null>(null);
  const pending = useRef<{
    wallet: BrowserWallet;
    promise: Promise<void>;
  } | null>(null);
  const mounted = useRef(true);
  const fundingPending = useRef<Promise<void> | null>(null);
  const busy = useRef(false);
  const [wallet, setWallet] = useState<BrowserWallet | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<DepositTransfer | null>(null);
  const disconnect = () => {
    const previous = current.current;
    current.current = null;
    pending.current = null;
    fundingPending.current = null;
    previous?.disconnect();
    if (previous)
      queries.removeQueries({ queryKey: ['evm-balances', previous.sessionId] });
    setWallet(null);
    setConnecting(false);
  };
  const connect = (choice: BrowserWalletChoice): Promise<void> => {
    if (pending.current?.wallet.choice.provider === choice.provider)
      return pending.current.promise;
    disconnect();
    setError(null);
    try {
      const next = new BrowserWallet(getEvmChainConfig(), choice, () => {
        if (current.current !== next) return;
        disconnect();
        setError(
          'EVM wallet account, network or connection changed. Connect again.',
        );
      });
      current.current = next;
      setConnecting(true);
      const promise = next
        .connect()
        .then(() => {
          next.assertActive();
          if (current.current === next && mounted.current) setWallet(next);
        })
        .catch((failure: unknown) => {
          if (current.current === next && mounted.current) {
            disconnect();
            setError(
              failure instanceof Error
                ? failure.message
                : 'EVM wallet connection failed.',
            );
          }
        })
        .finally(() => {
          if (current.current === next && mounted.current) {
            pending.current = null;
            setConnecting(false);
          }
        });
      pending.current = { wallet: next, promise };
      return promise;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'EVM configuration is invalid.',
      );
      return Promise.resolve();
    }
  };
  const active = wallet && current.current === wallet ? wallet : null;
  const balances = useQuery({
    queryKey: [
      'evm-balances',
      active?.sessionId,
      active?.config.chainId,
      active?.account,
    ],
    enabled: !!active,
    gcTime: 0,
    retry: false,
    refetchInterval: active ? 15_000 : false,
    queryFn: async () => {
      if (!active) throw new Error('Connect an EVM wallet first.');
      const client = getEthereumProvider(active.config);
      const [eth, tokens] = await Promise.all([
        client.getBalance({ address: active.account }),
        Promise.all(
          ERC20_TOKENS.map(async token => ({
            ...token,
            decimals: await fetchErc20Decimals(token.erc20Address),
            units: await client.readContract({
              address: getAddress(token.erc20Address),
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [active.account],
            }),
          })),
        ),
      ]);
      active.assertActive();
      return { eth, tokens };
    },
  });
  const funding = useMutation({
    mutationKey: ['evm-local-funding', active?.sessionId],
    mutationFn: async () => {
      const owner = current.current;
      if (!owner) throw new Error('Connect an EVM wallet first.');
      await owner.verify();
      const response = await fetch('/api/local-funding/evm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: owner.account }),
      });
      owner.assertActive();
      const body = await response.json();
      owner.assertActive();
      if (!response.ok) throw new Error(body.error ?? 'EVM funding failed.');
      await balances.refetch({ throwOnError: true });
      owner.assertActive();
    },
  });
  useEffect(() => {
    funding.reset();
    // Each extension session owns its funding progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.sessionId]);
  const fund = () => {
    if (fundingPending.current) return fundingPending.current;
    const operation = funding.mutateAsync().finally(() => {
      if (fundingPending.current === operation) fundingPending.current = null;
    });
    fundingPending.current = operation;
    return operation;
  };
  const usdc = balances.data?.tokens.find(token => token.symbol === 'USDC');
  const ready =
    !!active &&
    !balances.isError &&
    hasEvmDepositFunds(balances.data?.eth, usdc?.units, usdc?.decimals);
  const sendDeposit = async (
    binding: VaultBinding,
    token: string,
    amount: string,
  ) => {
    if (busy.current || transferRef.current?.sweep === 'pending') return;
    const owner = current.current;
    if (!owner) throw new Error('Connect an EVM wallet first.');
    if (!ready)
      throw new Error('Refresh or fund your EVM wallet before transferring.');
    binding.assertActive();
    const record: DepositTransfer = {
      binding,
      destination: binding.depositAddress,
      token,
      account: owner.account,
      status: 'approving',
      sweep: 'ready',
    };
    transferRef.current = record;
    busy.current = true;
    setTransfer(record);
    const publish = () => {
      if (mounted.current) setTransfer({ ...record });
    };
    try {
      await readiness.requireReady();
      owner.assertActive();
      binding.assertActive();
      const result = await transferDeposit({
        wallet: owner,
        client: getEthereumProvider(owner.config),
        token: getAddress(token),
        destination: getAddress(record.destination),
        amount,
        assertTarget: binding.assertActive,
        submitted: hash => {
          record.hash = hash;
          record.status = 'confirming';
          publish();
        },
      });
      record.hash = result.hash;
      record.units = result.units;
      record.status = 'confirmed';
      try {
        binding.assertActive();
        void vaultBalances.refresh(binding).catch(() => {});
      } catch {
        /* The captured vault can be replaced while the transaction confirms. */
      }
      void queries.invalidateQueries({
        queryKey: ['evm-balances', owner.sessionId],
      });
    } catch (failure) {
      record.status = 'error';
      record.error =
        failure instanceof Error ? failure.message : 'EVM transfer failed.';
    } finally {
      busy.current = false;
      publish();
    }
  };
  const continueDeposit = async () => {
    const record = transferRef.current;
    if (
      !record ||
      record.status !== 'confirmed' ||
      record.sweep !== 'ready' ||
      !record.units
    )
      return;
    try {
      record.binding.assertActive();
      if (vault.requireBinding() !== record.binding)
        throw new Error('Vault session changed.');
      record.sweep = 'pending';
      record.error = undefined;
      setTransfer({ ...record });
      await operations.deposit(record.token, record.units);
      record.sweep = 'complete';
    } catch (failure) {
      record.sweep = 'ready';
      record.error =
        failure instanceof Error ? failure.message : 'Midnight deposit failed.';
    } finally {
      if (mounted.current && transferRef.current === record)
        setTransfer({ ...record });
    }
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      current.current?.disconnect();
      current.current = null;
      pending.current = null;
    };
  }, []);
  return {
    wallet: active,
    connecting,
    error,
    connect,
    disconnect,
    balances,
    funding,
    fund,
    ready,
    transfer,
    sendDeposit,
    continueDeposit,
  };
}

const EvmWalletContext = createContext<ReturnType<
  typeof useEvmWalletOwner
> | null>(null);
export function EvmWalletProvider({ children }: { children: ReactNode }) {
  const value = useEvmWalletOwner();
  return (
    <EvmWalletContext.Provider value={value}>
      {children}
    </EvmWalletContext.Provider>
  );
}
export function useEvmWallet() {
  const value = useContext(EvmWalletContext);
  if (!value) throw new Error('useEvmWallet requires EvmWalletProvider.');
  return value;
}
