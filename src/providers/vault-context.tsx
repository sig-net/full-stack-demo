"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type JSX,
  type ReactNode,
  useContext,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { hexToBytes } from "viem";

import { getZkConfigOrigin } from "@/lib/config/runtime";
import { createVaultSession, type VaultBinding } from "@/lib/midnight/vault-session";
import type { Wallet } from "@/lib/midnight/wallet/Wallet";

import { useConfiguration } from "./configuration-context";
import { useMidnightConnection } from "./midnight-wallet-context";

type VaultSession = ReturnType<typeof createVaultSession>;
/** Binding eligibility keeps missing credentials, deployment failures and active loading distinct. */
export type VaultStatus =
  "disconnected" | "missing-identity" | "missing-deployment" | "loading" | "error" | "ready";

interface VaultContextValue {
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

/**
 * Cancels vault resources synchronously when captured inputs change.
 *
 * @param props - Provider content.
 * @param props.children - Components sharing the current vault binding.
 * @returns Binding state and explicit recovery actions.
 */
export function VaultProvider({ children }: { children: ReactNode }): JSX.Element {
  const connection = useMidnightConnection();
  const { owner, identity } = useConfiguration();
  const queryClient = useQueryClient();
  const revision = useRef(0);
  const current = useRef<{ session: VaultSession; wallet: Wallet } | null>(null);
  const [session, setSession] = useState<VaultSession | null>(null);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);
  const [retryRevision, setRetryRevision] = useState(0);
  const recovering = useRef(false);

  const clearSession = (): void => {
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

  useLayoutEffect(() =>
    owner.onInvalidate((scopes) => {
      if (!scopes.has("vault")) return;
      revision.current += 1;
      clearSession();
      setRetryRevision((value) => value + 1);
    }),
  );

  const startSession = (wallet: Wallet): VaultSession => {
    clearSession();
    const { applied: captured, identity: secret } = owner.getSnapshot();
    if (!secret.secret) throw new Error("Enter a vault secret first.");
    const { midnight, readiness } = captured;
    if (readiness.vault.status === "unavailable")
      throw new Error(readiness.vault.reasons.join(" "));
    const environment = readiness.vault.value;
    const zkOrigin = getZkConfigOrigin(window.location.origin);
    const attempt = revision.current;
    const next = createVaultSession({
      wallet,
      secret: hexToBytes(`0x${secret.secret}`),
      configuration: midnight,
      environment,
      zkOrigin,
      configurationRevision: captured.fingerprint,
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
      queryKey: ["vault-binding", "disabled"],
      queryFn: (): Promise<VaultBinding> => Promise.reject(new Error("Vault is not ready.")),
      gcTime: 0,
    }),
    enabled: activeSession !== null,
  });
  const binding = activeSession && query.isSuccess ? query.data : null;
  const requireBinding = (): VaultBinding => {
    const active = current.current;
    const result = active ? queryClient.getQueryData(active.session.options.queryKey) : null;
    if (!result) throw new Error("Vault is not ready.");
    result.assertActive();
    return result;
  };

  const retry = (): void => {
    revision.current += 1;
    clearSession();
    setRetryRevision((value) => value + 1);
  };
  const disconnect = (): void => {
    revision.current += 1;
    clearSession();
    connection.disconnect();
  };
  const rebuild = async (
    binding: VaultBinding,
    onOwnedFailure?: (error: unknown) => void,
  ): Promise<VaultBinding> => {
    binding.assertActive();
    if (connection.wallet?.recoveryUnavailable)
      throw new Error(connection.wallet.recoveryUnavailable);
    const attempt = ++revision.current;
    clearSession();
    recovering.current = true;
    let walletAttempt = connection.getGeneration();
    try {
      const recovery = connection.rebuild();
      walletAttempt = connection.getGeneration();
      const wallet = await recovery;
      if (attempt !== revision.current || !connection.isCurrent(wallet))
        throw new Error("Vault recovery superseded.");
      const next = startSession(wallet);
      const result = await queryClient.fetchQuery(next.options);
      result.assertActive();
      return result;
    } catch (error) {
      if (attempt === revision.current && walletAttempt === connection.getGeneration())
        onOwnedFailure?.(error);
      throw error;
    } finally {
      recovering.current = false;
      setRetryRevision((value) => value + 1);
    }
  };

  const onSessionInputsChanged = useEffectEvent((wallet: Wallet | null) => {
    if (recovering.current) return;
    if (wallet && current.current?.wallet === wallet && connection.isCurrent(wallet)) return;
    clearSession();
    if (!wallet || !owner.getSnapshot().identity.secret) return;
    try {
      startSession(wallet);
    } catch (error) {
      setDeploymentError(
        error instanceof Error
          ? error.message
          : "Vault deployment configuration is missing or invalid.",
      );
    }
  });
  useEffect(() => {
    onSessionInputsChanged(connection.wallet);
  }, [connection.wallet, connection.session, identity.secret, retryRevision]);

  useEffect(
    () => () => {
      revision.current += 1;
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
    ? "disconnected"
    : !identity.secret
      ? "missing-identity"
      : deploymentError
        ? "missing-deployment"
        : activeSession && query.isError
          ? "error"
          : binding
            ? "ready"
            : "loading";

  return (
    <VaultContext.Provider
      value={{
        status,
        error:
          connection.wallet?.transactionUnavailable ??
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

/**
 * Reads the current binding without acquiring separate SDK resources.
 *
 * @returns Shared vault state and generation-guarded binding actions.
 * @throws {Error} If the vault provider is missing.
 */
export function useVault(): VaultContextValue {
  const context = useContext(VaultContext);
  if (!context) throw new Error("useVault must be used within VaultProvider");
  return context;
}
