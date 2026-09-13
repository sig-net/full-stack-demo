"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import type * as React from "react";
import { useLayoutEffect } from "react";

import { MidnightProgressToaster } from "@/components/midnight-progress-toaster";
import { ERC20_TOKENS } from "@/lib/constants/token-metadata";
import { queryClient } from "@/lib/query-client";

import { EvmBalancesProvider } from "./evm-balances-context";
import { EvmDepositProvider } from "./evm-deposit-context";
import { EvmLocalFundingProvider } from "./evm-local-funding-context";
import { useEvmWallet } from "./evm-wallet-context";
import { EvmWalletProvider } from "./evm-wallet-context";
import { MidnightLocalFundingProvider } from "./midnight-local-funding-context";
import { MidnightReadinessProvider } from "./midnight-readiness-context";
import { useMidnightConnection } from "./midnight-wallet-context";
import { MidnightWalletProvider } from "./midnight-wallet-context";
import { RuntimeConfigProvider, useRuntimeConfig } from "./runtime-config-context";
import { VaultBalancesProvider } from "./vault-balances-context";
import { VaultProvider } from "./vault-context";
import { VaultIdentityProvider } from "./vault-identity-context";
import { VaultOperationsProvider } from "./vault-operations-context";

function RuntimeWallets({ children }: { children: React.ReactNode }): React.JSX.Element {
  const runtime = useRuntimeConfig();
  return (
    <MidnightWalletProvider configuration={runtime.applied.midnight}>
      <RuntimeWalletInvalidation />
      {children}
    </MidnightWalletProvider>
  );
}
function RuntimeWalletInvalidation(): null {
  const { owner } = useRuntimeConfig();
  const evm = useEvmWallet();
  const midnight = useMidnightConnection();
  useLayoutEffect(() =>
    owner.onInvalidate((scopes) => {
      if (scopes.has("evm")) evm.disconnect();
      if (scopes.has("midnight")) midnight.disconnect();
    }),
  );
  return null;
}

/**
 * Establishes the application provider order and mounts shared progress feedback.
 *
 * @param root0 - Provider properties.
 * @param root0.children - Application content rendered inside the provider tree.
 * @returns The application provider tree.
 */
export function Providers({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <RuntimeConfigProvider>
        <EvmWalletProvider>
          <EvmBalancesProvider tokens={ERC20_TOKENS.map((token) => token.erc20Address)}>
            <EvmLocalFundingProvider>
              <RuntimeWallets>
                <MidnightReadinessProvider>
                  <MidnightLocalFundingProvider>
                    <VaultIdentityProvider>
                      <VaultProvider>
                        <VaultBalancesProvider>
                          <VaultOperationsProvider>
                            <EvmDepositProvider>
                              {children}
                              <MidnightProgressToaster />
                            </EvmDepositProvider>
                          </VaultOperationsProvider>
                        </VaultBalancesProvider>
                      </VaultProvider>
                    </VaultIdentityProvider>
                  </MidnightLocalFundingProvider>
                </MidnightReadinessProvider>
              </RuntimeWallets>
            </EvmLocalFundingProvider>
          </EvmBalancesProvider>
          <ReactQueryDevtools initialIsOpen={false} />
        </EvmWalletProvider>
      </RuntimeConfigProvider>
    </QueryClientProvider>
  );
}
