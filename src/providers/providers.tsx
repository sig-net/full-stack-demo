'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import { EvmWalletProvider } from './evm-wallet-context';
import { queryClient } from '@/lib/query-client';
import { MidnightWalletProvider } from './midnight-wallet-context';
import { WalletReadinessProvider } from './wallet-readiness-context';
import { VaultProvider } from './vault-context';
import { VaultOperationsProvider } from './vault-operations-context';
import { VaultBalancesProvider } from './vault-balances-context';
import { MidnightProgressToaster } from '@/components/midnight-progress-toaster';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MidnightWalletProvider>
        <WalletReadinessProvider>
          <VaultProvider>
            <VaultBalancesProvider>
              <VaultOperationsProvider>
                <EvmWalletProvider>
                  {children}
                  <MidnightProgressToaster />
                </EvmWalletProvider>
              </VaultOperationsProvider>
            </VaultBalancesProvider>
          </VaultProvider>
        </WalletReadinessProvider>
      </MidnightWalletProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
