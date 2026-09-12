'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { hexToBytes } from 'viem';
import { useMidnightConnection } from './midnight-wallet-context';
import {
  getMidnightChainConfig,
  getZkConfigOrigin,
} from '@/lib/config/midnight';
import { getEvmChainConfig } from '@/lib/config/evm';
import { createVaultEnvironment } from '@/lib/midnight/env';
import {
  createVaultSession,
  type VaultBinding,
} from '@/lib/midnight/vault-session';
import type { Wallet } from '@/lib/midnight/wallet/Wallet';

type VaultSession = ReturnType<typeof createVaultSession>;
export type VaultStatus =
  | 'disconnected'
  | 'missing-identity'
  | 'missing-deployment'
  | 'loading'
  | 'error'
  | 'ready';

interface VaultContextValue {
  identitySecret: string;
  setIdentitySecret: (input: string) => void;
  clearIdentity: () => void;
  status: VaultStatus;
  error: string | null;
  binding: VaultBinding | null;
  requireBinding: () => VaultBinding;
  retry: () => void;
  rebuild: (
    binding: VaultBinding,
    onOwnedFailure?: (error: unknown) => void,
  ) => Promise<VaultBinding>;
  disconnect: () => void;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const connection = useMidnightConnection();
  const queryClient = useQueryClient();
  const [identitySecret, setSecret] = useState('');
  const secretRef = useRef('');
  const revision = useRef(0);
  const current = useRef<{ session: VaultSession; wallet: Wallet } | null>(
    null,
  );
  const [session, setSession] = useState<VaultSession | null>(null);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);
  const [retryRevision, setRetryRevision] = useState(0);
  const recovering = useRef(false);
  const configuration = useRef<{
    midnight: ReturnType<typeof getMidnightChainConfig>;
    environment: ReturnType<typeof createVaultEnvironment>;
    zkOrigin: string;
  } | null>(null);

  const clearSession = () => {
    const previous = current.current;
    current.current = null;
    if (previous) {
      previous.session.dispose();
      void queryClient.cancelQueries({
        queryKey: previous.session.options.queryKey,
        exact: true,
      });
      queryClient.removeQueries({
        queryKey: previous.session.options.queryKey,
        exact: true,
      });
    }
    setSession(null);
    setDeploymentError(null);
  };

  const startSession = (wallet: Wallet) => {
    clearSession();
    if (!secretRef.current) throw new Error('Enter a vault secret first.');
    if (!configuration.current) {
      const midnight = getMidnightChainConfig();
      configuration.current = {
        midnight,
        environment: createVaultEnvironment(midnight, getEvmChainConfig()),
        zkOrigin: getZkConfigOrigin(window.location.origin),
      };
    }
    const { midnight, environment, zkOrigin } = configuration.current;
    // Force lazy deployment validation before acquiring private state or an indexer.
    void environment.contractAddress;
    void environment.signetContractAddress;
    void environment.mpcSecpPub;
    const attempt = revision.current;
    const next = createVaultSession({
      wallet,
      secret: hexToBytes(`0x${secretRef.current}`),
      configuration: midnight,
      environment,
      zkOrigin,
      isCurrent: () =>
        revision.current === attempt &&
        current.current?.session === next &&
        connection.isCurrent(wallet),
    });
    current.current = { session: next, wallet };
    setSession(next);
    return next;
  };

  const activeSession =
    session &&
    current.current?.session === session &&
    connection.wallet === current.current.wallet &&
    connection.isCurrent(current.current.wallet)
      ? session
      : null;
  const query = useQuery({
    ...(activeSession?.options ?? {
      queryKey: ['vault-binding', 'disabled'],
      queryFn: async (): Promise<VaultBinding> => {
        throw new Error('Vault is not ready.');
      },
      gcTime: 0,
    }),
    enabled: activeSession !== null,
  });
  const binding =
    activeSession && query.isSuccess && query.data ? query.data : null;
  const requireBinding = () => {
    const active = current.current;
    const result = active
      ? queryClient.getQueryData(active.session.options.queryKey)
      : null;
    if (!result) throw new Error('Vault is not ready.');
    result.assertActive();
    return result;
  };

  const setIdentitySecret = (input: string) => {
    const normalised = input.trim().replace(/^0x/i, '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(normalised))
      throw new Error(
        'Enter a 32-byte vault secret as 64 hexadecimal characters.',
      );
    if (normalised === secretRef.current) return;
    revision.current += 1;
    clearSession();
    secretRef.current = normalised;
    setSecret(normalised);
  };
  const clearIdentity = () => {
    revision.current += 1;
    clearSession();
    secretRef.current = '';
    setSecret('');
  };
  const retry = () => {
    revision.current += 1;
    clearSession();
    setRetryRevision(value => value + 1);
  };
  const disconnect = () => {
    revision.current += 1;
    clearSession();
    connection.disconnect();
  };
  const rebuild = async (
    binding: VaultBinding,
    onOwnedFailure?: (error: unknown) => void,
  ) => {
    binding.assertActive();
    const attempt = ++revision.current;
    clearSession();
    recovering.current = true;
    let walletAttempt = connection.getGeneration();
    try {
      const recovery = connection.rebuild();
      walletAttempt = connection.getGeneration();
      const wallet = await recovery;
      if (attempt !== revision.current || !connection.isCurrent(wallet))
        throw new Error('Vault recovery superseded.');
      const next = startSession(wallet);
      const result = await queryClient.fetchQuery(next.options);
      result.assertActive();
      return result;
    } catch (error) {
      if (
        attempt === revision.current &&
        walletAttempt === connection.getGeneration()
      )
        onOwnedFailure?.(error);
      throw error;
    } finally {
      recovering.current = false;
      setRetryRevision(value => value + 1);
    }
  };

  useEffect(() => {
    if (recovering.current) return;
    if (
      current.current?.wallet === connection.wallet &&
      connection.wallet &&
      connection.isCurrent(connection.wallet)
    )
      return;
    clearSession();
    if (!connection.wallet || !secretRef.current) return;
    try {
      startSession(connection.wallet);
    } catch {
      setDeploymentError(
        'Vault deployment configuration is missing or invalid.',
      );
    }
    // Input revisions own resource lifetime. Functions observe the current owner refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.wallet, connection.session, identitySecret, retryRevision]);

  useEffect(
    () => () => {
      revision.current += 1;
      secretRef.current = '';
      const previous = current.current;
      current.current = null;
      previous?.session.dispose();
      if (previous)
        queryClient.removeQueries({
          queryKey: previous.session.options.queryKey,
          exact: true,
        });
    },
    [queryClient],
  );

  const status: VaultStatus = !connection.wallet
    ? 'disconnected'
    : !identitySecret
      ? 'missing-identity'
      : deploymentError
        ? 'missing-deployment'
        : activeSession && query.isError
          ? 'error'
          : binding
            ? 'ready'
            : 'loading';

  return (
    <VaultContext.Provider
      value={{
        identitySecret,
        setIdentitySecret,
        clearIdentity,
        status,
        error:
          deploymentError ??
          (activeSession ? (query.error?.message ?? null) : null),
        binding,
        requireBinding,
        retry,
        rebuild,
        disconnect,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVault(): VaultContextValue {
  const context = useContext(VaultContext);
  if (!context) throw new Error('useVault must be used within VaultProvider');
  return context;
}
