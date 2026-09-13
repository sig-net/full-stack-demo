'use client';

import { LocalWalletFunding } from '@/components/local-wallet-funding';
import { NavigationHeader } from '@/components/navigation-header';
import { BalanceSection } from '@/components/balance-section';
import { SwapWidget } from '@/components/swap-widget';
import { LendWidget } from '@/components/lend-widget';
import { ActivityListTable } from '@/components/activity-list-table';
import { EmptyStateWallet } from '@/components/empty-state-wallet';
import { useVault } from '@/providers/vault-context';

export default function Home() {
  const vault = useVault();
  const isConnected = vault.binding !== null;

  return (
    <div className='ds-page min-h-screen w-full overflow-x-hidden'>
      <NavigationHeader />
      <LocalWalletFunding />

      {!isConnected ? (
        <div className="ds-inset-content mx-auto ds-before-section max-w-full xl:container">
          <EmptyStateWallet />
        </div>
      ) : (
        <div className="ds-inset-content mx-auto ds-before-section max-w-full ds-bottom-inset-section lg:ds-before-section xl:container">
          <div className='ds-stack-section lg:ds-section-gap lg:flex-row'>
            <div className='ds-section-gap order-1 flex w-full flex-col lg:order-2 lg:w-auto lg:shrink-0'>
              <SwapWidget />
              <LendWidget />
            </div>

            <div className='ds-section-gap lg:ds-section-gap order-2 flex w-full flex-col lg:order-1 lg:flex-1'>
              <BalanceSection />
              <ActivityListTable />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const dynamic = 'force-dynamic';
