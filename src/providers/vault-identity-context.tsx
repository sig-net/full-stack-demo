"use client";

import {
  createContext,
  type JSX,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

interface VaultIdentityContextValue {
  identitySecret: string;
  getIdentitySecret: () => string;
  setIdentitySecret: (input: string) => void;
  clearIdentity: () => void;
  onInvalidate: (listener: () => void) => () => void;
}

const VaultIdentityContext = createContext<VaultIdentityContextValue | null>(null);

/**
 * Invalidates dependent bindings synchronously before publishing a changed applied identity.
 *
 * @param props - Provider content.
 * @param props.children - Consumers sharing the page's applied identity.
 * @returns The independent, memory-only identity owner.
 */
export function VaultIdentityProvider({ children }: { children: ReactNode }): JSX.Element {
  const [identitySecret, setSecret] = useState("");
  const applied = useRef("");
  const listeners = useRef(new Set<() => void>());
  const replace = (secret: string): void => {
    if (secret === applied.current) return;
    applied.current = secret;
    for (const listener of listeners.current) listener();
    setSecret(secret);
  };
  useEffect(
    () => () => {
      applied.current = "";
    },
    [],
  );
  return (
    <VaultIdentityContext.Provider
      value={{
        identitySecret,
        getIdentitySecret: () => applied.current,
        setIdentitySecret: (input) => {
          const normalised = input.trim().replace(/^0x/i, "").toLowerCase();
          if (!/^[0-9a-f]{64}$/.test(normalised))
            throw new Error("Enter a 32-byte vault secret as 64 hexadecimal characters.");
          replace(normalised);
        },
        clearIdentity: () => {
          replace("");
        },
        onInvalidate: (listener) => {
          listeners.current.add(listener);
          return () => {
            listeners.current.delete(listener);
          };
        },
      }}
    >
      {children}
    </VaultIdentityContext.Provider>
  );
}

/**
 * Reads the applied identity independently of wallet and vault readiness.
 *
 * @returns Identity state, validation actions and synchronous invalidation subscription.
 * @throws {Error} If the identity provider is missing.
 */
export function useVaultIdentity(): VaultIdentityContextValue {
  const context = useContext(VaultIdentityContext);
  if (!context) throw new Error("useVaultIdentity must be used within VaultIdentityProvider");
  return context;
}
