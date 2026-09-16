"use client";

import {
  createContext,
  type JSX,
  type ReactNode,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";

import {
  createRuntimeConfiguration,
  type RuntimeConfig,
  type RuntimeConfiguration,
  type RuntimeSnapshot,
} from "@/lib/config/runtime";

interface RuntimeConfigurationContextValue {
  owner: RuntimeConfiguration;
  applied: RuntimeSnapshot;
}
const RuntimeConfigContext = createContext<RuntimeConfigurationContextValue | null>(null);

/**
 * @param root0 - Provider content and optional injected configuration.
 * @param root0.children - Consumers sharing one transaction owner.
 * @param root0.initialConfiguration - Explicit configuration for an isolated provider lifetime.
 * @returns Context backed by immutable external-store snapshots.
 */
export function RuntimeConfigProvider({
  children,
  initialConfiguration,
}: {
  children: ReactNode;
  initialConfiguration?: RuntimeConfig;
}): JSX.Element {
  const [owner] = useState(() => createRuntimeConfiguration(initialConfiguration));
  const state = useSyncExternalStore(owner.subscribe, owner.getSnapshot, owner.getSnapshot);
  return (
    <RuntimeConfigContext.Provider value={{ owner, ...state }}>
      {children}
    </RuntimeConfigContext.Provider>
  );
}
/**
 * @returns The shared owner and currently applied snapshot.
 * @throws {Error} If the configuration provider is absent.
 */
export function useRuntimeConfiguration(): RuntimeConfigurationContextValue {
  const context = useContext(RuntimeConfigContext);
  if (!context) throw new Error("useRuntimeConfiguration requires RuntimeConfigProvider.");
  return context;
}
