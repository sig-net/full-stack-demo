"use client";

import {
  createContext,
  type JSX,
  type ReactNode,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import {
  isExactLocalFaucetConfiguration,
  LOCAL_FAUCET_UNAVAILABLE,
  type LocalFaucetDescriptor,
} from "@/lib/config/local-faucet";
import {
  createRuntimeConfiguration,
  type RuntimeConfig,
  type RuntimeConfiguration,
  type RuntimeState,
} from "@/lib/config/runtime";

/** Local faucet availability for the applied configuration against the server descriptor. */
export interface LocalFaucetState {
  readonly descriptor: LocalFaucetDescriptor;
  readonly eligible: boolean;
  /**
   * Rechecks eligibility against the latest applied configuration before a funding request.
   *
   * @throws {Error} If the applied configuration is not the exact local faucet configuration.
   */
  readonly requireEligible: () => void;
}
/** The shared store, its published state and the faucet policy derived from that state. */
export interface ConfigurationContextValue extends RuntimeState {
  readonly owner: RuntimeConfiguration;
  readonly localFaucet: LocalFaucetState;
}

const ConfigurationContext = createContext<ConfigurationContextValue | null>(null);

/**
 * Owns public configuration, the page-memory vault identity and local faucet eligibility.
 *
 * @param props - Provider content, the server faucet descriptor and optional injected configuration.
 * @param props.children - Consumers sharing one store.
 * @param props.localFaucet - Server-provided local endpoint descriptor. Omitting it marks the
 * local faucets unavailable.
 * @param props.initialConfiguration - Explicit configuration for an isolated provider lifetime.
 * @returns Context backed by immutable external-store state.
 */
export function ConfigurationProvider({
  children,
  localFaucet = LOCAL_FAUCET_UNAVAILABLE,
  initialConfiguration,
}: {
  children: ReactNode;
  localFaucet?: LocalFaucetDescriptor;
  initialConfiguration?: RuntimeConfig;
}): JSX.Element {
  const [owner] = useState(() => createRuntimeConfiguration(initialConfiguration));
  const state = useSyncExternalStore(owner.subscribe, owner.getSnapshot, owner.getSnapshot);
  useEffect(
    () => () => {
      owner.clearIdentity();
    },
    [owner],
  );
  const requireEligible = (): void => {
    if (!isExactLocalFaucetConfiguration(owner.getSnapshot().applied, localFaucet))
      throw new Error("Apply the exact local faucet configuration before funding.");
  };
  return (
    <ConfigurationContext.Provider
      value={{
        owner,
        ...state,
        localFaucet: {
          descriptor: localFaucet,
          eligible: isExactLocalFaucetConfiguration(state.applied, localFaucet),
          requireEligible,
        },
      }}
    >
      {children}
    </ConfigurationContext.Provider>
  );
}
/**
 * @returns The shared store, the applied configuration, the identity and faucet eligibility.
 * @throws {Error} If the configuration provider is absent.
 */
export function useConfiguration(): ConfigurationContextValue {
  const context = useContext(ConfigurationContext);
  if (!context) throw new Error("useConfiguration requires ConfigurationProvider.");
  return context;
}
