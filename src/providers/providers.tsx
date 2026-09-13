'use client';

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

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <EvmWalletProvider>
      <QueryClientProvider client={queryClient}>
        <EvmBalancesProvider
          tokens={ERC20_TOKENS.map(token => token.erc20Address)}
        >
          <EvmLocalFundingProvider>
            <MidnightWalletProvider>
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
            </MidnightWalletProvider>
          </EvmLocalFundingProvider>
        </EvmBalancesProvider>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </EvmWalletProvider>
  );
}
