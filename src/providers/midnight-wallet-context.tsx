'use client';

import './buffer-shim';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getMidnightChainConfig } from '@/lib/config/midnight';
import type { Wallet } from '@/lib/midnight/wallet/Wallet';
import type { SeedWallet } from '@/lib/midnight/wallet/SeedWallet';

interface MidnightWalletContextValue {
  wallet: Wallet | null;
  connecting: boolean;
  syncStatus: string;
  session: number;
  isCurrent: (wallet: Wallet) => boolean;
  getGeneration: () => number;
  installSeedWallet: (seed: string) => Promise<Wallet>;
  rebuild: () => Promise<Wallet>;
  disconnect: () => void;
}

const MidnightWalletContext = createContext<MidnightWalletContextValue | null>(
  null,
);

export function MidnightWalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [session, setSession] = useState(0);
  const generation = useRef(0);
  const active = useRef<SeedWallet | null>(null);
  const installedSeed = useRef<string | null>(null);
  const configuration = useRef<ReturnType<
    typeof getMidnightChainConfig
  > | null>(null);
  const inFlight = useRef<{ seed: string; promise: Promise<Wallet> } | null>(
    null,
  );

  const disconnect = () => {
    generation.current += 1;
    setSession(generation.current);
    installedSeed.current = null;
    inFlight.current = null;
    void active.current?.disconnect().catch(() => {});
    active.current = null;
    setWallet(null);
    setConnecting(false);
    setSyncStatus('');
  };

  const installSeedWallet = (input: string): Promise<Wallet> => {
    const seed = input.trim().replace(/^0x/i, '').toLowerCase();
    if (!/^(?:[0-9a-f]{2}){16,64}$/.test(seed)) {
      return Promise.reject(
        new Error('Enter a hexadecimal Midnight seed of 16–64 bytes.'),
      );
    }
    if (inFlight.current?.seed === seed) return inFlight.current.promise;
    if (active.current && installedSeed.current === seed)
      return Promise.resolve(active.current);
    disconnect();
    const attempt = generation.current;
    installedSeed.current = seed;
    setConnecting(true);
    setSyncStatus('starting wallet…');
    const promise = (async () => {
      configuration.current ??= getMidnightChainConfig();
      const { SeedWallet } = await import('@/lib/midnight/wallet/SeedWallet');
      if (attempt !== generation.current)
        throw new Error('Wallet connection superseded.');
      const candidate = new SeedWallet(configuration.current, seed);
      active.current = candidate;
      await candidate.initialise(status => {
        if (attempt === generation.current) setSyncStatus(status);
      });
      if (attempt !== generation.current) {
        await candidate.disconnect();
        throw new Error('Wallet connection superseded.');
      }
      setWallet(candidate);
      return candidate;
    })()
      .catch(error => {
        if (attempt === generation.current) {
          void active.current?.disconnect().catch(() => {});
          active.current = null;
          installedSeed.current = null;
          setSyncStatus('');
        }
        throw error;
      })
      .finally(() => {
        if (attempt === generation.current) {
          inFlight.current = null;
          setConnecting(false);
        }
      });
    inFlight.current = { seed, promise };
    return promise;
  };

  const rebuild = (): Promise<Wallet> => {
    const seed = installedSeed.current;
    if (!seed)
      return Promise.reject(new Error('Connect a Midnight seed wallet first.'));
    disconnect();
    return installSeedWallet(seed);
  };

  useEffect(() => {
    const deletion = indexedDB.deleteDatabase('midnight-wallet-cache');
    deletion.onerror = () => {};
    return () => {
      generation.current += 1;
      installedSeed.current = null;
      inFlight.current = null;
      void active.current?.disconnect().catch(() => {});
      active.current = null;
    };
  }, []);

  return (
    <MidnightWalletContext.Provider
      value={{
        wallet,
        connecting,
        syncStatus,
        session,
        isCurrent: wallet => active.current === wallet,
        getGeneration: () => generation.current,
        installSeedWallet,
        rebuild,
        disconnect,
      }}
    >
      {children}
    </MidnightWalletContext.Provider>
  );
}

export function useMidnightConnection(): MidnightWalletContextValue {
  const context = useContext(MidnightWalletContext);
  if (!context)
    throw new Error(
      'useMidnightConnection must be used within MidnightWalletProvider',
    );
  return context;
}
