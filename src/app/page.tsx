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
    <div className='gradient-bg-main min-h-screen w-full overflow-x-hidden'>
      <NavigationHeader />
      <LocalWalletFunding />

      {!isConnected ? (
        <div className='mx-auto mt-16 max-w-full p-4 xl:container'>
          <EmptyStateWallet />
        </div>
      ) : (
        <div className='mx-auto mt-8 max-w-full p-4 pb-16 lg:mt-16 xl:container'>
          <div className='flex flex-col gap-6 lg:flex-row lg:gap-8'>
            <div className='order-1 flex w-full flex-col gap-6 lg:order-2 lg:w-auto lg:shrink-0'>
              <SwapWidget />
              <LendWidget />
            </div>

            <div className='order-2 flex w-full flex-col gap-8 lg:order-1 lg:flex-1 lg:gap-12'>
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
