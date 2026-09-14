"use client";

import { createContext, type JSX, type ReactNode, useContext } from "react";

import {
  isExactLocalFaucetConfiguration,
  type LocalFaucetDescriptor,
} from "@/lib/config/local-faucet";

import { useRuntimeConfiguration } from "./runtime-config-context";

interface LocalFaucetState {
  readonly descriptor: LocalFaucetDescriptor;
  readonly eligible: boolean;
  readonly requireEligible: () => void;
}

const LocalFaucetContext = createContext<LocalFaucetState | null>(null);

/**
 * Shares the public local faucet descriptor with browser funding controls.
 *
 * @param properties - Descriptor and descendant providers.
 * @param properties.children - Descendant providers and application content.
 * @param properties.descriptor - Server-provided local endpoint descriptor.
 * @returns The local faucet context surrounding funding consumers.
 */
export function LocalFaucetProvider({
  children,
  descriptor,
}: {
  children: ReactNode;
  descriptor: LocalFaucetDescriptor;
}): JSX.Element {
  const { applied, owner } = useRuntimeConfiguration();
  const requireEligible = (): void => {
    if (!isExactLocalFaucetConfiguration(owner.getSnapshot().applied, descriptor))
      throw new Error("Apply the exact local faucet configuration before funding.");
  };
  return (
    <LocalFaucetContext.Provider
      value={{
        descriptor,
        eligible: isExactLocalFaucetConfiguration(applied, descriptor),
        requireEligible,
      }}
    >
      {children}
    </LocalFaucetContext.Provider>
  );
}

/**
 * Reads local faucet eligibility for the applied browser configuration.
 *
 * @returns The public descriptor and exact configuration match state.
 * @throws {Error} If the local faucet provider is absent.
 */
export function useLocalFaucet(): LocalFaucetState {
  const state = useContext(LocalFaucetContext);
  if (!state) throw new Error("useLocalFaucet requires LocalFaucetProvider.");
  return state;
}
