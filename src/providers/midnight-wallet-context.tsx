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
import {
  getMidnightChainConfig,
  type MidnightNodeConfig,
} from '@/lib/config/midnight';
import type { Wallet } from '@/lib/midnight/wallet/Wallet';
import type { BrowserWalletChoice } from '@/lib/midnight/wallet/BrowserWallet';

interface MidnightWalletContextValue {
  wallet: Wallet | null;
  connecting: boolean;
  error: string | null;
  syncStatus: string;
  session: number;
  isCurrent: (wallet: Wallet) => boolean;
  getGeneration: () => number;
  installSeedWallet: (seed: string) => Promise<Wallet>;
  installBrowserWallet: (choice: BrowserWalletChoice) => Promise<Wallet>;
  rebuild: () => Promise<Wallet>;
  disconnect: () => void;
}

const MidnightWalletContext = createContext<MidnightWalletContextValue | null>(
  null,
);

export function MidnightWalletProvider({
  children,
  configuration: suppliedConfiguration,
}: {
  children: ReactNode;
  configuration?: MidnightNodeConfig;
}) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState('');
  const [session, setSession] = useState(0);
  const generation = useRef(0);
  const active = useRef<Wallet | null>(null);
  const installedSeed = useRef<string | null>(null);
  const configuration = useRef<ReturnType<
    typeof getMidnightChainConfig
  > | null>(null);
  const seedInFlight = useRef<{
    seed: string;
    promise: Promise<Wallet>;
  } | null>(null);

  const browserInFlight = useRef<{
    connector: BrowserWalletChoice['connector'];
    promise: Promise<Wallet>;
  } | null>(null);

  const disconnect = () => {
    generation.current += 1;
    setSession(generation.current);
    installedSeed.current = null;
    seedInFlight.current = null;
    browserInFlight.current = null;
    void active.current?.disconnect().catch(() => {});
    active.current = null;
    setWallet(null);
    setConnecting(false);
    setSyncStatus('');
    setError(null);
  };

  const installSeedWallet = (input: string): Promise<Wallet> => {
    const seed = input.trim().replace(/^0x/i, '').toLowerCase();
    if (!/^(?:[0-9a-f]{2}){16,64}$/.test(seed)) {
      return Promise.reject(
        new Error('Enter a hexadecimal Midnight seed of 16–64 bytes.'),
      );
    }
    if (seedInFlight.current?.seed === seed)
      return seedInFlight.current.promise;
    if (active.current && installedSeed.current === seed)
      return Promise.resolve(active.current);
    disconnect();
    const attempt = generation.current;
    installedSeed.current = seed;
    setConnecting(true);
    setSyncStatus('starting wallet…');
    const promise = (async () => {
      configuration.current = suppliedConfiguration ?? getMidnightChainConfig();
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
          seedInFlight.current = null;
          browserInFlight.current = null;
          setConnecting(false);
        }
      });
    seedInFlight.current = { seed, promise };
    return promise;
  };

  const installBrowserWallet = (
    choice: BrowserWalletChoice,
  ): Promise<Wallet> => {
    if (browserInFlight.current?.connector === choice.connector)
      return browserInFlight.current.promise;
    disconnect();
    const attempt = generation.current;
    setConnecting(true);
    const promise = (async () => {
      configuration.current = suppliedConfiguration ?? getMidnightChainConfig();
      const { BrowserWallet } = await import(
        '@/lib/midnight/wallet/BrowserWallet'
      );
      if (attempt !== generation.current)
        throw new Error('Wallet connection superseded.');
      const candidate = new BrowserWallet(
        choice,
        configuration.current,
        error => {
          if (active.current !== candidate) return;
          disconnect();
          setError(error.message);
        },
      );
      active.current = candidate;
      await candidate.connect();
      if (attempt !== generation.current) {
        await candidate.disconnect();
        throw new Error('Wallet connection superseded.');
      }
      setWallet(candidate);
      return candidate;
    })()
      .catch(error => {
        if (attempt === generation.current) disconnect();
        throw error;
      })
      .finally(() => {
        if (attempt === generation.current) {
          browserInFlight.current = null;
          setConnecting(false);
        }
      });
    browserInFlight.current = { connector: choice.connector, promise };
    return promise;
  };

  const rebuild = (): Promise<Wallet> => {
    if (active.current?.recoveryUnavailable)
      return Promise.reject(new Error(active.current.recoveryUnavailable));
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
      seedInFlight.current = null;
      browserInFlight.current = null;
      void active.current?.disconnect().catch(() => {});
      active.current = null;
    };
  }, []);

  return (
    <MidnightWalletContext.Provider
      value={{
        wallet,
        connecting,
        error,
        syncStatus,
        session,
        isCurrent: wallet => active.current === wallet,
        getGeneration: () => generation.current,
        installSeedWallet,
        installBrowserWallet,
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
