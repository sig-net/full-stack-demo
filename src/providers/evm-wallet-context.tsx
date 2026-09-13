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

import type { Wallet, WalletConnection } from "@/lib/evm/wallet/Wallet";

interface EvmWalletState {
  wallet: Wallet | null;
  connecting: boolean;
  error: string | null;
  connect: (connection: WalletConnection) => Promise<void>;
  disconnect: () => void;
}

function useEvmWalletOwner(): EvmWalletState {
  const current = useRef<Wallet | null>(null);
  const pending = useRef<{
    wallet: Wallet;
    key: WalletConnection["key"];
    promise: Promise<void>;
  } | null>(null);
  const mounted = useRef(true);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disconnect = (): void => {
    const previous = current.current;
    current.current = null;
    pending.current = null;
    previous?.disconnect();
    setWallet(null);
    setConnecting(false);
  };
  const connect = (connection: WalletConnection): Promise<void> => {
    if (pending.current?.key === connection.key) return pending.current.promise;
    disconnect();
    setError(null);
    try {
      const next = connection.create((reason) => {
        if (current.current !== next) return;
        disconnect();
        setError(
          reason?.message ?? "EVM wallet account, network or connection changed. Connect again.",
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
            setError(failure instanceof Error ? failure.message : "EVM wallet connection failed.");
          }
        })
        .finally(() => {
          if (current.current === next && mounted.current) {
            pending.current = null;
            setConnecting(false);
          }
        });
      pending.current = { wallet: next, key: connection.key, promise };
      return promise;
    } catch (failure) {
      disconnect();
      setError(failure instanceof Error ? failure.message : "EVM configuration is invalid.");
      return Promise.resolve();
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
  return { wallet, connecting, error, connect, disconnect };
}

const EvmWalletContext = createContext<ReturnType<typeof useEvmWalletOwner> | null>(null);
/**
 * Owns the signing session and invalidates it when its account, network or provider changes.
 *
 * @param props - Provider content.
 * @param props.children - Components sharing the signing session.
 * @returns The session context surrounding its consumers.
 */
export function EvmWalletProvider({ children }: { children: ReactNode }): JSX.Element {
  const value = useEvmWalletOwner();
  return <EvmWalletContext.Provider value={value}>{children}</EvmWalletContext.Provider>;
}
/**
 * Reads the signing session without acquiring a provider connection.
 *
 * @returns Session state and explicit connection actions.
 * @throws {Error} If the wallet provider is missing.
 */
export function useEvmWallet(): EvmWalletState {
  const value = useContext(EvmWalletContext);
  if (!value) throw new Error("useEvmWallet requires EvmWalletProvider.");
  return value;
}
