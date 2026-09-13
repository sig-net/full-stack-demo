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

import { getZkConfigOrigin } from "@/lib/config/midnight";
import { createVaultSession, type VaultBinding } from "@/lib/midnight/vault-session";
import type { Wallet } from "@/lib/midnight/wallet/Wallet";

import { useMidnightConnection } from "./midnight-wallet-context";
import { useRuntimeConfig } from "./runtime-config-context";

type VaultSession = ReturnType<typeof createVaultSession>;
/** Binding eligibility keeps missing credentials, deployment failures and active loading distinct. */
export type VaultStatus =
  "disconnected" | "missing-identity" | "missing-deployment" | "loading" | "error" | "ready";

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

/**
 * Owns caller identity and cancels vault resources synchronously when captured inputs change.
 *
 * @param props - Provider content.
 * @param props.children - Components sharing the current vault binding.
 * @returns Binding state and explicit identity/recovery actions.
 */
export function VaultProvider({ children }: { children: ReactNode }): JSX.Element {
  const connection = useMidnightConnection();
  const runtime = useRuntimeConfig();
  const queryClient = useQueryClient();
  const [identitySecret, setSecret] = useState("");
  const secretRef = useRef("");
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
    runtime.owner.onInvalidate((scopes) => {
      if (!scopes.has("vault")) return;
      revision.current += 1;
      clearSession();
      setRetryRevision((value) => value + 1);
    }),
  );

  const startSession = (wallet: Wallet): VaultSession => {
    clearSession();
    if (!secretRef.current) throw new Error("Enter a vault secret first.");
    const captured = runtime.owner.getSnapshot().applied;
    const { midnight, environment } = captured;
    const zkOrigin = getZkConfigOrigin(window.location.origin);
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

  const setIdentitySecret = (input: string): void => {
    const normalised = input.trim().replace(/^0x/i, "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(normalised))
      throw new Error("Enter a 32-byte vault secret as 64 hexadecimal characters.");
    if (normalised === secretRef.current) return;
    revision.current += 1;
    clearSession();
    secretRef.current = normalised;
    setSecret(normalised);
  };
  const clearIdentity = (): void => {
    revision.current += 1;
    clearSession();
    secretRef.current = "";
    setSecret("");
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
    if (!wallet || !secretRef.current) return;
    try {
      startSession(wallet);
    } catch {
      setDeploymentError("Vault deployment configuration is missing or invalid.");
    }
  });
  useEffect(() => {
    onSessionInputsChanged(connection.wallet);
  }, [connection.wallet, connection.session, identitySecret, retryRevision]);

  useEffect(
    () => () => {
      revision.current += 1;
      secretRef.current = "";
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
    : !identitySecret
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
        identitySecret,
        setIdentitySecret,
        clearIdentity,
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
 * Reads the current identity and binding without acquiring separate SDK resources.
 *
 * @returns Shared vault state and generation-guarded binding actions.
 * @throws {Error} If the vault provider is missing.
 */
export function useVault(): VaultContextValue {
  const context = useContext(VaultContext);
  if (!context) throw new Error("useVault must be used within VaultProvider");
  return context;
}
