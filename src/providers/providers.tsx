'use client';

import { useLayoutEffect } from 'react';
import {
  RuntimeConfigProvider,
  useRuntimeConfig,
} from './runtime-config-context';
import { useEvmWallet } from './evm-wallet-context';
import { useMidnightConnection } from './midnight-wallet-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import { EvmBalancesProvider } from './evm-balances-context';
import { EvmLocalFundingProvider } from './evm-local-funding-context';
import { EvmDepositProvider } from './evm-deposit-context';
import { ERC20_TOKENS } from '@/lib/constants/token-metadata';
import { EvmWalletProvider } from './evm-wallet-context';
import { queryClient } from '@/lib/query-client';
import { MidnightWalletProvider } from './midnight-wallet-context';
import { WalletReadinessProvider } from './wallet-readiness-context';
import { VaultProvider } from './vault-context';
import { VaultOperationsProvider } from './vault-operations-context';
import { VaultBalancesProvider } from './vault-balances-context';
import { MidnightProgressToaster } from '@/components/midnight-progress-toaster';

function RuntimeWallets({ children }: { children: React.ReactNode }) {
  const runtime = useRuntimeConfig();
  return (
    <MidnightWalletProvider configuration={runtime.applied.midnight}>
      <RuntimeWalletInvalidation />
      {children}
    </MidnightWalletProvider>
  );
}
function RuntimeWalletInvalidation() {
  const { owner } = useRuntimeConfig();
  const evm = useEvmWallet();
  const midnight = useMidnightConnection();
  useLayoutEffect(() =>
    owner.onInvalidate(scopes => {
      if (scopes.has('evm')) evm.disconnect();
      if (scopes.has('midnight')) midnight.disconnect();
    }),
  );
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <RuntimeConfigProvider>
        <EvmWalletProvider>
          <EvmBalancesProvider
            tokens={ERC20_TOKENS.map(token => token.erc20Address)}
          >
            <EvmLocalFundingProvider>
              <RuntimeWallets>
                <WalletReadinessProvider>
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
                </WalletReadinessProvider>
              </RuntimeWallets>
            </EvmLocalFundingProvider>
          </EvmBalancesProvider>
          <ReactQueryDevtools initialIsOpen={false} />
        </EvmWalletProvider>
      </RuntimeConfigProvider>
    </QueryClientProvider>
  );
}
