'use client';

import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  createRuntimeConfiguration,
  runtimeFields,
  runtimeFingerprint,
  type RuntimeDefaults,
} from '@/lib/config/runtime';

function useRuntimeOwner() {
  const [owner] = useState(() => createRuntimeConfiguration());
  const state = useSyncExternalStore(
    owner.subscribe,
    owner.getSnapshot,
    owner.getSnapshot,
  );
  const server = useQuery({
    queryKey: ['server-runtime-configuration'],
    queryFn: async () => {
      const response = await fetch('/api/runtime-config', {
        cache: 'no-store',
      });
      if (!response.ok)
        throw new Error('Server deployment configuration is unavailable.');
      const result = (await response.json()) as RuntimeDefaults & {
        fingerprint: string;
      };
      if (
        runtimeFingerprint(result.fields, result.signetContractAddress) !==
        result.fingerprint
      )
        throw new Error('Server configuration verification failed.');
      return result;
    },
    retry: false,
    refetchInterval: 30_000,
  });
  const differences = server.data
    ? runtimeFields
        .filter(
          field =>
            field.scope !== null &&
            server.data.fields[field.key] !== state.applied.fields[field.key],
        )
        .map(field => field.label)
    : [];
  if (
    server.data &&
    server.data.signetContractAddress !== owner.defaults.signetContractAddress
  )
    differences.push('Signet contract address');
  const serverUnavailable =
    server.isError || !server.data
      ? 'Server deployment compatibility is unavailable. Independent wallet actions remain available.'
      : differences.length
        ? `Server-assisted actions are unavailable: ${differences.join(', ')} differ from the server.`
        : null;
  const requireServerHeaders = () => {
    if (serverUnavailable || !server.data)
      throw new Error(
        serverUnavailable ?? 'Server configuration is unavailable.',
      );
    if (owner.getSnapshot().applied.fingerprint !== state.applied.fingerprint)
      throw new Error('Configuration changed. Retry the action.');
    return { 'x-vault-configuration': state.applied.fingerprint };
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
const RuntimeConfigContext = createContext<ReturnType<
  typeof useRuntimeOwner
> | null>(null);
export function RuntimeConfigProvider({ children }: { children: ReactNode }) {
  const value = useRuntimeOwner();
  return (
    <RuntimeConfigContext.Provider value={value}>
      {children}
    </RuntimeConfigContext.Provider>
  );
}
export function useRuntimeConfig() {
  const context = useContext(RuntimeConfigContext);
  if (!context)
    throw new Error('useRuntimeConfig requires RuntimeConfigProvider.');
  return context;
}
