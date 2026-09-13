"use client";

import { MidnightNetwork } from "@sig-net/midnight";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  createContext,
  type JSX,
  type ReactNode,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";
import { z } from "zod";

import {
  createRuntimeConfiguration,
  type RuntimeConfiguration,
  runtimeFields,
  runtimeFingerprint,
} from "@/lib/config/runtime";

const serverConfigurationSchema = z.object({
  fields: z
    .record(z.enum(runtimeFields.map((field) => field.key)), z.string())
    .and(z.object({ networkId: z.enum(MidnightNetwork) })),
  signetContractAddress: z.string(),
  fingerprint: z.string(),
});

interface RuntimeConfigState
  extends
    ReturnType<RuntimeConfiguration["getSnapshot"]>,
    Pick<RuntimeConfiguration, "edit" | "apply" | "reset" | "discard"> {
  owner: RuntimeConfiguration;
  differences: string[];
  serverUnavailable: string | null;
  requireServerHeaders: () => Record<string, string>;
  server: UseQueryResult<z.infer<typeof serverConfigurationSchema>>;
}

function useRuntimeOwner(): RuntimeConfigState {
  const [owner] = useState(() => createRuntimeConfiguration());
  const state = useSyncExternalStore(owner.subscribe, owner.getSnapshot, owner.getSnapshot);
  const server = useQuery({
    queryKey: ["server-runtime-configuration"],
    queryFn: async () => {
      const response = await fetch("/api/runtime-config", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Server deployment configuration is unavailable.");
      const input: unknown = await response.json();
      const result = serverConfigurationSchema.parse(input);
      if (runtimeFingerprint(result.fields, result.signetContractAddress) !== result.fingerprint)
        throw new Error("Server configuration verification failed.");
      return result;
    },
    retry: false,
    refetchInterval: 30_000,
  });
  const differences = server.data
    ? runtimeFields
        .filter(
          (field) =>
            field.scope !== null &&
            server.data.fields[field.key] !== state.applied.fields[field.key],
        )
        .map((field) => field.label)
    : [];
  if (server.data && server.data.signetContractAddress !== owner.defaults.signetContractAddress)
    differences.push("Signet contract address");
  const serverUnavailable =
    server.isError || !server.data
      ? "Server deployment compatibility is unavailable. Independent wallet actions remain available."
      : differences.length
        ? `Server-assisted actions are unavailable: ${differences.join(", ")} differ from the server.`
        : null;
  const requireServerHeaders = (): Record<string, string> => {
    if (serverUnavailable || !server.data)
      throw new Error(serverUnavailable ?? "Server configuration is unavailable.");
    if (owner.getSnapshot().applied.fingerprint !== state.applied.fingerprint)
      throw new Error("Configuration changed. Retry the action.");
    return { "x-vault-configuration": state.applied.fingerprint };
  };
  return {
    ...state,
    owner,
    edit: owner.edit,
    apply: owner.apply,
    reset: owner.reset,
    discard: owner.discard,
    differences,
    serverUnavailable,
    requireServerHeaders,
    server,
  };
}
const RuntimeConfigContext = createContext<ReturnType<typeof useRuntimeOwner> | null>(null);
/**
 * Owns editable deployment inputs and their server-compatibility observation.
 *
 * @param props - Provider content.
 * @param props.children - Components sharing applied configuration and its draft.
 * @returns The runtime configuration context.
 */
export function RuntimeConfigProvider({ children }: { children: ReactNode }): JSX.Element {
  const value = useRuntimeOwner();
  return <RuntimeConfigContext.Provider value={value}>{children}</RuntimeConfigContext.Provider>;
}
/**
 * Reads the shared draft, applied revision and assisted-action compatibility state.
 *
 * @returns Configuration state and explicit edit/apply/reset actions.
 * @throws {Error} If the configuration provider is missing.
 */
export function useRuntimeConfig(): RuntimeConfigState {
  const context = useContext(RuntimeConfigContext);
  if (!context) throw new Error("useRuntimeConfig requires RuntimeConfigProvider.");
  return context;
}
