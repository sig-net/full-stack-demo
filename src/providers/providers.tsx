"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import type * as React from "react";

import { MidnightProgressToaster } from "@/components/midnight-progress-toaster";
import type { LocalFaucetDescriptor } from "@/lib/config/local-faucet";
import { ERC20_TOKENS } from "@/lib/constants/token-metadata";
import { queryClient } from "@/lib/query-client";

import { ConfigurationProvider, useConfiguration } from "./configuration-context";
import { EvmBalancesProvider } from "./evm-balances-context";
import { EvmDepositProvider } from "./evm-deposit-context";
import { EvmLocalFundingProvider } from "./evm-local-funding-context";
import { EvmWalletProvider } from "./evm-wallet-context";
import { MidnightLocalFundingProvider } from "./midnight-local-funding-context";
import { MidnightReadinessProvider } from "./midnight-readiness-context";
import { MidnightWalletProvider } from "./midnight-wallet-context";
import { VaultBalancesProvider } from "./vault-balances-context";
import { VaultProvider } from "./vault-context";
import { VaultOperationsProvider } from "./vault-operations-context";

function ConfiguredEvmBalances({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { applied } = useConfiguration();
  return (
    <EvmBalancesProvider
      tokens={
        applied.evm.chainId === 11155111n ? ERC20_TOKENS.map((token) => token.erc20Address) : []
      }
    >
      {children}
    </EvmBalancesProvider>
  );
}

/**
 * Establishes the application provider order and mounts shared progress feedback.
 *
 * @param root0 - Provider properties.
 * @param root0.children - Application content rendered inside the provider tree.
 * @param root0.localFaucet - Server-provided local endpoint descriptor.
 * @returns The application provider tree.
 */
export function Providers({
  children,
  localFaucet,
}: {
  children: React.ReactNode;
  localFaucet: LocalFaucetDescriptor;
}): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigurationProvider localFaucet={localFaucet}>
        <EvmWalletProvider>
          <MidnightWalletProvider>
            <ConfiguredEvmBalances>
              <EvmLocalFundingProvider>
                <MidnightReadinessProvider>
                  <MidnightLocalFundingProvider>
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
                  </MidnightLocalFundingProvider>
                </MidnightReadinessProvider>
              </EvmLocalFundingProvider>
            </ConfiguredEvmBalances>
          </MidnightWalletProvider>
          <ReactQueryDevtools initialIsOpen={false} />
        </EvmWalletProvider>
      </ConfigurationProvider>
    </QueryClientProvider>
  );
}
